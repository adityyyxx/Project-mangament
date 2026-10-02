import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { Outlet } from 'react-router-dom'
import { SignIn, useAuth, useUser } from '@clerk/clerk-react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchWorkspaces, addWorkspace, setCurrentWorkspace } from '../features/workspaceSlice'
import { loadTheme } from '../features/themeSlice'
import { Loader2Icon, Briefcase } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../configs/api'

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const { user, isLoaded } = useUser()
    const { workspaces, loading } = useSelector((state) => state.workspace)
    const { getToken } = useAuth()
    const dispatch = useDispatch()

    const [firstWorkspaceName, setFirstWorkspaceName] = useState("")
    const [isCreatingFirstWs, setIsCreatingFirstWs] = useState(false)

    // Initial load of theme
    useEffect(() => {
        dispatch(loadTheme())
    }, [])

    // Initial load of workspaces
    useEffect(() => {
        if (isLoaded && user && workspaces.length === 0) {
            dispatch(fetchWorkspaces({ getToken }))
        }
    }, [user, isLoaded])

    const handleCreateFirstWorkspace = async (e) => {
        e.preventDefault();
        if (!firstWorkspaceName.trim()) return;

        try {
            setIsCreatingFirstWs(true);
            toast.loading("Setting up your workspace...");
            const token = await getToken();
            const { data } = await api.post(
                "/api/workspaces",
                { name: firstWorkspaceName.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            dispatch(addWorkspace(data.workspace));
            dispatch(setCurrentWorkspace(data.workspace.id));
            toast.dismissAll();
            toast.success("Workspace created! Welcome to your dashboard.");
        } catch (err) {
            toast.dismissAll();
            toast.error(err?.response?.data?.message || err.message || "Failed to create workspace");
        } finally {
            setIsCreatingFirstWs(false);
        }
    };

    if (!user) {
        return (
            <div className="flex justify-center items-center h-screen bg-white dark:bg-zinc-950">
                <SignIn />
            </div>
        )
    }

    if (loading) return (
        <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
            <Loader2Icon className="size-7 text-blue-500 animate-spin" />
        </div>
    )

    if (user && workspaces.length === 0) {
        return (
            <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            <Briefcase className="size-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Create your workspace</h2>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Set up your team workspace to start managing projects
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateFirstWorkspace} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                                Workspace Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={firstWorkspaceName}
                                onChange={(e) => setFirstWorkspaceName(e.target.value)}
                                placeholder="e.g. My Team Workspace"
                                required
                                className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isCreatingFirstWs || !firstWorkspaceName.trim()}
                            className="w-full py-2.5 px-4 text-sm font-medium rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                            {isCreatingFirstWs ? "Creating Workspace..." : "Get Started"}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
            <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
            <div className="flex-1 flex flex-col h-screen">
                <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
                <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export default Layout
