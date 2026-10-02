import { useState } from "react";
import { XIcon, Briefcase } from "lucide-react";
import { useAuth, useOrganizationList } from "@clerk/clerk-react";
import { useDispatch } from "react-redux";
import { addWorkspace, setCurrentWorkspace } from "../features/workspaceSlice";
import toast from "react-hot-toast";
import api from "../configs/api";

const CreateWorkspaceDialog = ({ isDialogOpen, setIsDialogOpen }) => {
    const dispatch = useDispatch();
    const { getToken } = useAuth();
    const { setActive } = useOrganizationList({ userMemberships: true });

    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        description: "",
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleNameChange = (e) => {
        const name = e.target.value;
        const autoSlug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        setFormData((prev) => ({
            ...prev,
            name,
            slug: autoSlug,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            return toast.error("Workspace name is required");
        }

        try {
            setIsSubmitting(true);
            toast.loading("Creating workspace...");
            
            let token = null;
            try {
                token = await getToken({ skipCache: true });
            } catch (tErr) {
                token = await getToken().catch(() => null);
            }
            if (!token) {
                token = await getToken().catch(() => null);
            }

            if (!token) {
                toast.dismissAll();
                toast.error("Session expired or invalid. Please sign out and sign back in.");
                setIsSubmitting(false);
                return;
            }

            const { data } = await api.post(
                "/api/workspaces",
                {
                    name: formData.name.trim(),
                    slug: formData.slug.trim(),
                    description: formData.description.trim(),
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            dispatch(addWorkspace(data.workspace));
            dispatch(setCurrentWorkspace(data.workspace.id));

            if (setActive && data.workspace?.id?.startsWith("org_")) {
                try {
                    await setActive({ organization: data.workspace.id });
                } catch (e) {
                    console.log("Could not set active organization:", e);
                }
            }

            toast.dismissAll();
            toast.success("Workspace created successfully!");
            setFormData({ name: "", slug: "", description: "" });
            setIsDialogOpen(false);
        } catch (error) {
            toast.dismissAll();
            const errMsg = error?.response?.data?.message || error.message || "Failed to create workspace";
            if (error?.response?.status === 401 || errMsg === "Unauthorized") {
                toast.error("Session expired or unauthorized. Please sign out and sign in again.");
            } else {
                toast.error(errMsg);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isDialogOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/20 dark:bg-black/60 backdrop-blur flex items-center justify-center text-left z-50 p-4">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 w-full max-w-md text-zinc-900 dark:text-zinc-200 relative shadow-2xl">
                <button
                    className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    onClick={() => setIsDialogOpen(false)}
                >
                    <XIcon className="size-5" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        <Briefcase className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Create Workspace</h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Create a new team workspace to manage projects and tasks
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Workspace Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={handleNameChange}
                            placeholder="e.g. Acme Corp or Product Team"
                            required
                            className="w-full px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Workspace Slug (URL Identifier)
                        </label>
                        <input
                            type="text"
                            value={formData.slug}
                            onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                            placeholder="e.g. acme-corp"
                            className="w-full px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-[11px] text-zinc-400 mt-1">
                            Auto-generated from name. Lowercase letters, numbers, and hyphens only.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                            Description (Optional)
                        </label>
                        <textarea
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="What does your team work on?"
                            className="w-full px-3 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 resize-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsDialogOpen(false)}
                            className="px-4 py-2 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !formData.name.trim()}
                            className="px-5 py-2 text-sm rounded bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                            {isSubmitting ? "Creating..." : "Create Workspace"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateWorkspaceDialog;
