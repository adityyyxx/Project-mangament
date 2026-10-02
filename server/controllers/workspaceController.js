import prisma from "../configs/prisma.js";
import { clerkClient } from "@clerk/express";

// Get all workspaces for user
export const getUserWorkspaces = async (req, res) => {
    try {
        const { userId } = await req.auth();
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // 1. Ensure user exists in local database
        let user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            try {
                const clerkUser = await clerkClient.users.getUser(userId);
                const email = clerkUser?.emailAddresses?.[0]?.emailAddress || `${userId}@example.com`;
                const firstName = clerkUser?.firstName || "";
                const lastName = clerkUser?.lastName || "";
                const name = (firstName + " " + lastName).trim() || "User";
                const image = clerkUser?.imageUrl || "";

                user = await prisma.user.upsert({
                    where: { id: userId },
                    update: { email, name, image },
                    create: { id: userId, email, name, image }
                });
            } catch (clerkErr) {
                console.log("Could not fetch Clerk user details, creating fallback user:", clerkErr.message);
                user = await prisma.user.upsert({
                    where: { id: userId },
                    update: {},
                    create: {
                        id: userId,
                        email: `${userId}@clerk.user`,
                        name: "User",
                        image: ""
                    }
                });
            }
        }

        // 2. Sync organizations from Clerk in case webhook didn't fire (e.g. local dev)
        try {
            const orgMemberships = await clerkClient.users.getOrganizationMembershipList({ userId });
            const clerkOrgs = orgMemberships?.data || orgMemberships || [];

            for (const mem of clerkOrgs) {
                const org = mem.organization;
                if (!org) continue;

                const baseSlug = (org.slug || org.name || "workspace")
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '') || `ws-${org.id}`;

                const existingWs = await prisma.workspace.findUnique({
                    where: { id: org.id }
                });

                if (!existingWs) {
                    let uniqueSlug = baseSlug;
                    const slugExists = await prisma.workspace.findUnique({ where: { slug: uniqueSlug } });
                    if (slugExists) {
                        uniqueSlug = `${baseSlug}-${org.id.slice(-4)}`;
                    }

                    await prisma.workspace.create({
                        data: {
                            id: org.id,
                            name: org.name,
                            slug: uniqueSlug,
                            ownerId: org.createdBy || userId,
                            image_url: org.imageUrl || "",
                            members: {
                                create: {
                                    userId: userId,
                                    role: mem.role === "org:admin" ? "ADMIN" : "MEMBER"
                                }
                            }
                        }
                    });
                } else {
                    const isMember = await prisma.workspaceMember.findUnique({
                        where: {
                            userId_workspaceId: {
                                userId: userId,
                                workspaceId: org.id
                            }
                        }
                    });
                    if (!isMember) {
                        await prisma.workspaceMember.create({
                            data: {
                                userId: userId,
                                workspaceId: org.id,
                                role: mem.role === "org:admin" ? "ADMIN" : "MEMBER"
                            }
                        });
                    }
                }
            }
        } catch (syncErr) {
            console.log("Clerk org sync notice:", syncErr.message);
        }

        // 3. Get workspaces for user
        let workspaces = await prisma.workspace.findMany({
            where: {
                members: { some: { userId: userId } }
            },
            include: {
                members: { include: { user: true } },
                projects: {
                    include: {
                        tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                        members: { include: { user: true } }
                    }
                },
                owner: true
            }
        });

        // 3. Auto-create a default workspace if user has no workspaces (fixes missing webhook issue in dev)
        if (workspaces.length === 0) {
            const workspaceId = `ws_${Date.now()}`;
            const workspaceName = `${user.name}'s Workspace`;
            const slug = `workspace-${Date.now()}`;

            await prisma.workspace.create({
                data: {
                    id: workspaceId,
                    name: workspaceName,
                    slug: slug,
                    ownerId: userId,
                    image_url: user.image || "",
                    members: {
                        create: {
                            userId: userId,
                            role: "ADMIN"
                        }
                    }
                }
            });

            workspaces = await prisma.workspace.findMany({
                where: {
                    members: { some: { userId: userId } }
                },
                include: {
                    members: { include: { user: true } },
                    projects: {
                        include: {
                            tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                            members: { include: { user: true } }
                        }
                    },
                    owner: true
                }
            });
        }

        res.json({ workspaces });
    } catch (error) {
        console.log("Error in getUserWorkspaces:", error);
        res.status(500).json({ message: error.code || error.message });
    }
};

// Delete workspace
export const deleteWorkspace = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { id } = req.params;

        const workspace = await prisma.workspace.findUnique({
            where: { id },
            include: { members: true }
        });

        if (!workspace) {
            return res.status(404).json({ message: "Workspace not found" });
        }

        // Only owner or ADMIN role can delete workspace
        if (workspace.ownerId !== userId) {
            const member = workspace.members.find(m => m.userId === userId);
            if (!member || member.role !== "ADMIN") {
                return res.status(403).json({ message: "You don't have permission to delete this workspace" });
            }
        }

        await prisma.workspace.delete({
            where: { id }
        });

        res.json({ message: "Workspace deleted successfully", workspaceId: id });
    } catch (error) {
        console.log("Error in deleteWorkspace:", error);
        res.status(500).json({ message: error.code || error.message });
    }
};

// Create workspace
export const createWorkspace = async (req, res) => {
    try {
        const { userId } = await req.auth();
        const { name, slug, description, image_url } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Workspace name is required" });
        }

        // Generate or validate slug
        const baseSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `workspace-${Date.now()}`;
        let workspaceSlug = baseSlug;

        const existingWorkspace = await prisma.workspace.findUnique({
            where: { slug: workspaceSlug }
        });

        if (existingWorkspace) {
            workspaceSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
        }

        // Try to create organization in Clerk as well
        let workspaceId = req.body.id;
        if (!workspaceId) {
            try {
                const clerkOrg = await clerkClient.organizations.createOrganization({
                    name: name.trim(),
                    createdBy: userId,
                    slug: workspaceSlug
                });
                workspaceId = clerkOrg.id;
            } catch (clerkErr) {
                console.log("Clerk org create notice (using local ID):", clerkErr.message);
                workspaceId = `ws_${Date.now()}`;
            }
        }

        // Ensure user exists in database
        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            try {
                const clerkUser = await clerkClient.users.getUser(userId);
                const email = clerkUser?.emailAddresses?.[0]?.emailAddress || `${userId}@example.com`;
                const firstName = clerkUser?.firstName || "";
                const lastName = clerkUser?.lastName || "";
                const userName = (firstName + " " + lastName).trim() || "User";
                const userImg = clerkUser?.imageUrl || "";

                user = await prisma.user.upsert({
                    where: { id: userId },
                    update: { email, name: userName, image: userImg },
                    create: { id: userId, email, name: userName, image: userImg }
                });
            } catch (e) {
                user = await prisma.user.upsert({
                    where: { id: userId },
                    update: {},
                    create: { id: userId, email: `${userId}@clerk.user`, name: "User", image: "" }
                });
            }
        }

        const workspace = await prisma.workspace.create({
            data: {
                id: workspaceId,
                name: name.trim(),
                slug: workspaceSlug,
                description: description || null,
                image_url: image_url || user?.image || "",
                ownerId: userId,
                members: {
                    create: {
                        userId,
                        role: "ADMIN"
                    }
                }
            },
            include: {
                members: { include: { user: true } },
                projects: {
                    include: {
                        tasks: { include: { assignee: true, comments: { include: { user: true } } } },
                        members: { include: { user: true } }
                    }
                },
                owner: true
            }
        });

        res.status(201).json({ workspace, message: "Workspace created successfully" });
    } catch (error) {
        console.log("Error in createWorkspace:", error);
        res.status(500).json({ message: error.code || error.message });
    }
};