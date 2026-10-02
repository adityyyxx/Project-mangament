import express from 'express';
import cors from 'cors';
import prisma from './configs/prisma.js';
import workspaceRouter from "./routes/workspaceRoutes.js";
import projectRouter from "./routes/projectRoutes.js";
import taskRouter from "./routes/taskRoutes.js";
import commentRouter from "./routes/commentRoutes.js";

// Setup test app
const app = express();
app.use(express.json());
app.use(cors());

// Test auth middleware that supports simulating users or unauthenticated requests
app.use((req, res, next) => {
    const testUserId = req.headers['x-test-user-id'];
    req.auth = async () => ({
        userId: testUserId || null
    });
    next();
});

// Protect middleware (matches production authMiddleware)
const protect = async (req, res, next) => {
    try {
        const { userId } = await req.auth();
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        return next();
    } catch (error) {
        res.status(401).json({ message: error.code || error.message });
    }
};

app.get('/', (req, res) => res.send('Server is live!'));
app.use("/api/workspaces", protect, workspaceRouter);
app.use("/api/projects", protect, projectRouter);
app.use("/api/tasks", protect, taskRouter);
app.use("/api/comments", protect, commentRouter);

const PORT = 5055;
const server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}`);
    try {
        await runAllTests();
    } catch (e) {
        console.error("Test execution failed:", e);
    } finally {
        server.close();
        await prisma.$disconnect();
    }
});

const BASE = `http://localhost:${PORT}`;

async function request(method, path, { userId, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (userId) headers['x-test-user-id'] = userId;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    let data;
    const text = await res.text();
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }
    return { status: res.status, data };
}

const testResults = [];

function record(method, route, testName, expectedStatus, actualStatus, actualData, passCondition = null) {
    const passed = (actualStatus === expectedStatus) && (passCondition ? passCondition(actualData) : true);
    testResults.push({
        method,
        route,
        test: testName,
        expected: `Status ${expectedStatus}`,
        actual: `Status ${actualStatus}: ${typeof actualData === 'object' ? JSON.stringify(actualData).substring(0, 80) : actualData}`,
        status: passed ? 'PASSED' : 'FAILED',
        details: actualData
    });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${method} ${route} | ${testName} -> Expected: ${expectedStatus}, Got: ${actualStatus}`);
}

async function runAllTests() {
    console.log("\n=================== STARTING API TEST SUITE ===================\n");

    // Existing test users
    const USER_ADMIN = "user_3K9MWCcEcC6xqOOAkEkibDmLIDZ"; // Owns ws_1790965748964
    const USER_OTHER = "user_3K9OQ3eQiTy8C91dtZlCo65Fei7"; // Owns ws_1790966383755
    const USER_STRANGER = "user_non_existent_99999999999";
    const WS_ADMIN_ID = "ws_1790965748964";
    const WS_OTHER_ID = "ws_1790966383755";

    // 1. HEALTH CHECK
    {
        const res = await request('GET', '/');
        record('GET', '/', 'Health check returns 200 and live text', 200, res.status, res.data, (d) => d === 'Server is live!');
    }

    // 2. WORKSPACE ROUTES
    // GET /api/workspaces
    {
        const unauth = await request('GET', '/api/workspaces');
        record('GET', '/api/workspaces', 'Unauthorized request without token returns 401', 401, unauth.status, unauth.data);

        const valid = await request('GET', '/api/workspaces', { userId: USER_ADMIN });
        record('GET', '/api/workspaces', 'Valid user fetches workspaces array', 200, valid.status, valid.data, (d) => Array.isArray(d.workspaces));
    }

    // DELETE /api/workspaces/:id
    {
        const unauth = await request('DELETE', `/api/workspaces/${WS_ADMIN_ID}`);
        record('DELETE', '/api/workspaces/:id', 'Unauthorized delete without token returns 401', 401, unauth.status, unauth.data);

        const nonExistent = await request('DELETE', `/api/workspaces/ws_invalid_9999`, { userId: USER_ADMIN });
        record('DELETE', '/api/workspaces/:id', 'Delete non-existent workspace returns 404', 404, nonExistent.status, nonExistent.data);

        const forbidden = await request('DELETE', `/api/workspaces/${WS_ADMIN_ID}`, { userId: USER_OTHER });
        record('DELETE', '/api/workspaces/:id', 'Forbidden delete by non-admin/non-owner returns 403', 403, forbidden.status, forbidden.data);
    }

    // Check POST /api/workspaces
    let createdWorkspaceId = null;
    {
        const unauth = await request('POST', '/api/workspaces', { body: { name: 'Test WS' } });
        record('POST', '/api/workspaces', 'Unauthorized workspace creation returns 401', 401, unauth.status, unauth.data);

        const missing = await request('POST', '/api/workspaces', { userId: USER_ADMIN, body: {} });
        record('POST', '/api/workspaces', 'Missing workspace name returns 400', 400, missing.status, missing.data);

        const valid = await request('POST', '/api/workspaces', { userId: USER_ADMIN, body: { name: 'Test Workspace REST' } });
        record('POST', '/api/workspaces', 'Valid workspace creation returns 201', 201, valid.status, valid.data, (d) => !!d.workspace?.id);
        if (valid.data?.workspace?.id) {
            createdWorkspaceId = valid.data.workspace.id;
        }
    }

    // 3. PROJECT ROUTES
    let createdProjectId = null;
    // POST /api/projects
    {
        const unauth = await request('POST', '/api/projects', { body: {} });
        record('POST', '/api/projects', 'Unauthorized project creation returns 401', 401, unauth.status, unauth.data);

        const missing = await request('POST', '/api/projects', { userId: USER_ADMIN, body: {} });
        record('POST', '/api/projects', 'Missing workspaceId/name returns 400', 400, missing.status, missing.data);

        const forbidden = await request('POST', '/api/projects', {
            userId: USER_OTHER,
            body: { workspaceId: WS_ADMIN_ID, name: 'Hack Project', team_lead: 'at27122003@gmail.com' }
        });
        record('POST', '/api/projects', 'Forbidden creation in workspace where user is not ADMIN returns 403', 403, forbidden.status, forbidden.data);

        const invalidLead = await request('POST', '/api/projects', {
            userId: USER_ADMIN,
            body: { workspaceId: WS_ADMIN_ID, name: 'Invalid Lead Project', team_lead: 'not_found_email_12345@gmail.com' }
        });
        record('POST', '/api/projects', 'Non-existent team_lead email returns 400', 400, invalidLead.status, invalidLead.data);

        const valid = await request('POST', '/api/projects', {
            userId: USER_ADMIN,
            body: {
                workspaceId: WS_ADMIN_ID,
                name: 'Alpha Project',
                description: 'Test Project Description',
                status: 'ACTIVE',
                priority: 'HIGH',
                progress: 10,
                team_lead: 'at27122003@gmail.com',
                team_members: ['at27122003@gmail.com']
            }
        });
        record('POST', '/api/projects', 'Valid project creation returns 200 and project object', 200, valid.status, valid.data, (d) => !!d.project?.id);
        if (valid.data?.project?.id) {
            createdProjectId = valid.data.project.id;
        }
    }

    // PUT /api/projects
    {
        const unauth = await request('PUT', '/api/projects', { body: {} });
        record('PUT', '/api/projects', 'Unauthorized project update returns 401', 401, unauth.status, unauth.data);

        const nonExistent = await request('PUT', '/api/projects', {
            userId: USER_ADMIN,
            body: { id: 'invalid-project-uuid', workspaceId: WS_ADMIN_ID, name: 'Updated Name' }
        });
        record('PUT', '/api/projects', 'Update non-existent project handled properly', 404, nonExistent.status, nonExistent.data);

        if (createdProjectId) {
            const forbidden = await request('PUT', '/api/projects', {
                userId: USER_OTHER,
                body: { id: createdProjectId, workspaceId: WS_ADMIN_ID, name: 'Hacked Project' }
            });
            record('PUT', '/api/projects', 'Forbidden update by non-admin returns 403', 403, forbidden.status, forbidden.data);

            const valid = await request('PUT', '/api/projects', {
                userId: USER_ADMIN,
                body: {
                    id: createdProjectId,
                    workspaceId: WS_ADMIN_ID,
                    name: 'Alpha Project Updated',
                    status: 'PLANNING',
                    priority: 'MEDIUM',
                    progress: 30
                }
            });
            record('PUT', '/api/projects', 'Valid project update returns 200 and updated data', 200, valid.status, valid.data);
        }
    }

    // POST /api/projects/:projectId/addMember
    {
        const unauth = await request('POST', `/api/projects/some-id/addMember`, { body: { email: 'test@example.com' } });
        record('POST', '/api/projects/:projectId/addMember', 'Unauthorized member add returns 401', 401, unauth.status, unauth.data);

        const nonExistentProj = await request('POST', `/api/projects/00000000-0000-0000-0000-000000000000/addMember`, {
            userId: USER_ADMIN,
            body: { email: 'adityatiwarii.x@gmail.com' }
        });
        record('POST', '/api/projects/:projectId/addMember', 'Non-existent project returns 404', 404, nonExistentProj.status, nonExistentProj.data);

        if (createdProjectId) {
            const forbidden = await request('POST', `/api/projects/${createdProjectId}/addMember`, {
                userId: USER_OTHER,
                body: { email: 'adityatiwarii.x@gmail.com' }
            });
            record('POST', '/api/projects/:projectId/addMember', 'Forbidden: Non-team-lead adding member returns 403 (not 404)', 403, forbidden.status, forbidden.data);

            const nonExistentUser = await request('POST', `/api/projects/${createdProjectId}/addMember`, {
                userId: USER_ADMIN,
                body: { email: 'doesnotexist999@domain.com' }
            });
            record('POST', '/api/projects/:projectId/addMember', 'Non-existent user email returns 404', 404, nonExistentUser.status, nonExistentUser.data);

            const validAdd = await request('POST', `/api/projects/${createdProjectId}/addMember`, {
                userId: USER_ADMIN,
                body: { email: 'adityatiwarii.x@gmail.com' }
            });
            record('POST', '/api/projects/:projectId/addMember', 'Valid member add returns 200', 200, validAdd.status, validAdd.data);

            const duplicateAdd = await request('POST', `/api/projects/${createdProjectId}/addMember`, {
                userId: USER_ADMIN,
                body: { email: 'adityatiwarii.x@gmail.com' }
            });
            record('POST', '/api/projects/:projectId/addMember', 'Duplicate member add returns 400 (not 500)', 400, duplicateAdd.status, duplicateAdd.data);
        }
    }

    // 4. TASK ROUTES
    let createdTaskId = null;
    // POST /api/tasks
    {
        const unauth = await request('POST', '/api/tasks', { body: {} });
        record('POST', '/api/tasks', 'Unauthorized task create returns 401', 401, unauth.status, unauth.data);

        const nonExistentProj = await request('POST', '/api/tasks', {
            userId: USER_ADMIN,
            body: { projectId: '00000000-0000-0000-0000-000000000000', title: 'Task 1', due_date: new Date() }
        });
        record('POST', '/api/tasks', 'Task creation with non-existent project returns 404', 404, nonExistentProj.status, nonExistentProj.data);

        if (createdProjectId) {
            const forbidden = await request('POST', '/api/tasks', {
                userId: USER_OTHER,
                body: { projectId: createdProjectId, title: 'Unauthorized Task', due_date: new Date() }
            });
            record('POST', '/api/tasks', 'Forbidden: Non-team-lead creating task returns 403', 403, forbidden.status, forbidden.data);

            const invalidAssignee = await request('POST', '/api/tasks', {
                userId: USER_ADMIN,
                body: {
                    projectId: createdProjectId,
                    title: 'Invalid Assignee Task',
                    assigneeId: 'user_unknown_stranger',
                    due_date: new Date()
                }
            });
            record('POST', '/api/tasks', 'Assignee not in project returns 403', 403, invalidAssignee.status, invalidAssignee.data);

            const validTask = await request('POST', '/api/tasks', {
                userId: USER_ADMIN,
                body: {
                    projectId: createdProjectId,
                    title: 'Build Login API',
                    description: 'Implement JWT auth',
                    type: 'FEATURE',
                    status: 'TODO',
                    priority: 'HIGH',
                    assigneeId: USER_ADMIN,
                    due_date: new Date(Date.now() + 86400000).toISOString()
                }
            });
            record('POST', '/api/tasks', 'Valid task creation returns 200', 200, validTask.status, validTask.data, (d) => !!d.task?.id);
            if (validTask.data?.task?.id) {
                createdTaskId = validTask.data.task.id;
            }
        }
    }

    // PUT /api/tasks/:id
    {
        const unauth = await request('PUT', '/api/tasks/invalid-id', { body: {} });
        record('PUT', '/api/tasks/:id', 'Unauthorized task update returns 401', 401, unauth.status, unauth.data);

        const nonExistent = await request('PUT', '/api/tasks/00000000-0000-0000-0000-000000000000', {
            userId: USER_ADMIN,
            body: { status: 'IN_PROGRESS' }
        });
        record('PUT', '/api/tasks/:id', 'Non-existent task update returns 404', 404, nonExistent.status, nonExistent.data);

        if (createdTaskId) {
            const forbidden = await request('PUT', `/api/tasks/${createdTaskId}`, {
                userId: USER_OTHER,
                body: { status: 'DONE' }
            });
            record('PUT', '/api/tasks/:id', 'Forbidden: Non-team-lead updating task returns 403', 403, forbidden.status, forbidden.data);

            const validUpdate = await request('PUT', `/api/tasks/${createdTaskId}`, {
                userId: USER_ADMIN,
                body: { status: 'IN_PROGRESS', priority: 'MEDIUM' }
            });
            record('PUT', '/api/tasks/:id', 'Valid task update returns 200', 200, validUpdate.status, validUpdate.data);
        }
    }

    // 5. COMMENT ROUTES
    let createdCommentId = null;
    // POST /api/comments
    {
        const unauth = await request('POST', '/api/comments', { body: {} });
        record('POST', '/api/comments', 'Unauthorized comment creation returns 401', 401, unauth.status, unauth.data);

        const nonExistentTask = await request('POST', '/api/comments', {
            userId: USER_ADMIN,
            body: { taskId: '00000000-0000-0000-0000-000000000000', content: 'Hello' }
        });
        record('POST', '/api/comments', 'Comment on non-existent task returns 404 (not 500 TypeError)', 404, nonExistentTask.status, nonExistentTask.data);

        if (createdTaskId) {
            const nonMember = await request('POST', '/api/comments', {
                userId: 'user_unknown_stranger',
                body: { taskId: createdTaskId, content: 'Spy comment' }
            });
            record('POST', '/api/comments', 'Non-project member commenting returns 403', 403, nonMember.status, nonMember.data);

            const validComment = await request('POST', '/api/comments', {
                userId: USER_ADMIN,
                body: { taskId: createdTaskId, content: 'This is going well!' }
            });
            record('POST', '/api/comments', 'Valid comment creation returns 200', 200, validComment.status, validComment.data, (d) => !!d.comment?.id);
            if (validComment.data?.comment?.id) {
                createdCommentId = validComment.data.comment.id;
            }
        }
    }

    // GET /api/comments/:taskId
    {
        const unauth = await request('GET', '/api/comments/test-id');
        record('GET', '/api/comments/:taskId', 'Unauthorized get comments returns 401', 401, unauth.status, unauth.data);

        if (createdTaskId) {
            const valid = await request('GET', `/api/comments/${createdTaskId}`, { userId: USER_ADMIN });
            record('GET', '/api/comments/:taskId', 'Valid get comments returns 200 and list', 200, valid.status, valid.data, (d) => Array.isArray(d.comments) && d.comments.length > 0);
        }
    }

    // POST /api/tasks/delete
    {
        const unauth = await request('POST', '/api/tasks/delete', { body: {} });
        record('POST', '/api/tasks/delete', 'Unauthorized task delete returns 401', 401, unauth.status, unauth.data);

        const empty = await request('POST', '/api/tasks/delete', { userId: USER_ADMIN, body: { tasksIds: [] } });
        record('POST', '/api/tasks/delete', 'Empty tasksIds returns 404 (Task not found)', 404, empty.status, empty.data);

        if (createdTaskId) {
            const forbidden = await request('POST', '/api/tasks/delete', {
                userId: USER_OTHER,
                body: { tasksIds: [createdTaskId] }
            });
            record('POST', '/api/tasks/delete', 'Forbidden: Non-team-lead deleting task returns 403', 403, forbidden.status, forbidden.data);

            const validDelete = await request('POST', '/api/tasks/delete', {
                userId: USER_ADMIN,
                body: { tasksIds: [createdTaskId] }
            });
            record('POST', '/api/tasks/delete', 'Valid task deletion returns 200', 200, validDelete.status, validDelete.data);
        }
    }

    // CLEANUP / CASCADE TEST: Delete the project created for test
    if (createdProjectId) {
        await prisma.project.delete({ where: { id: createdProjectId } }).catch(() => {});
    }
    if (createdWorkspaceId) {
        await prisma.workspace.delete({ where: { id: createdWorkspaceId } }).catch(() => {});
    }

    console.log("\n=================== TEST RESULTS SUMMARY ===================\n");
    const passed = testResults.filter(t => t.status === 'PASSED').length;
    const failed = testResults.filter(t => t.status === 'FAILED').length;
    console.log(`TOTAL: ${testResults.length} | PASSED: ${passed} | FAILED: ${failed}`);
}
