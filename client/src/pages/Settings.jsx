import { useEffect, useState } from "react";
import { UserIcon, Shield, Save, LogOut } from "lucide-react";
import { useClerk, useUser } from "@clerk/clerk-react";

export default function Settings() {
    const { user } = useUser();
    const { signOut } = useClerk();

    const [profileData, setProfileData] = useState({ firstName: "", lastName: "" });
    const [isUpdating, setIsUpdating] = useState(false);
    const [activeTab, setActiveTab] = useState("profile");

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setIsUpdating(true);
        await user.update({
            firstName: profileData.firstName,
            lastName: profileData.lastName,
        });
        setIsUpdating(false);
    };

    useEffect(() => {
        if (user) {
            setProfileData({ firstName: user.firstName, lastName: user.lastName });
        }
    }, [user]);

    const handleLogout = () => {
        if (window.confirm("Are you sure you want to log out?")) {
            signOut();
        }
    };

    return user && (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
                <p className="text-gray-500 dark:text-zinc-400">
                    Manage your account settings and preferences
                </p>
            </div>

            {/* Tabs */}
            <div className="space-y-6">
                <div className="inline-flex gap-2 bg-gray-100 dark:bg-zinc-950 dark:bg-gradient-to-br dark:from-zinc-800/70 dark:to-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-lg p-1">
                    {[
                        { key: "profile", icon: <UserIcon className="w-4 h-4" />, label: "Profile" },
                        { key: "account", icon: <Shield className="w-4 h-4" />, label: "Account" },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${activeTab === tab.key
                                    ? "bg-gray-300 dark:bg-zinc-800 text-gray-900 dark:text-white"
                                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Profile Tab */}
                {activeTab === "profile" && (
                    <div className="bg-gray-100 dark:bg-zinc-950 dark:bg-gradient-to-br dark:from-zinc-800/70 dark:to-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-lg p-6 space-y-6">
                        <h2 className="text-gray-900 dark:text-white text-lg font-semibold mb-4">Profile Information</h2>
                        <div className="flex items-center gap-6">
                            <img src={user.imageUrl} className="w-20 h-20 rounded-full" alt="Profile Image" />
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{user.fullName}</h3>
                                <p className="text-gray-500 dark:text-zinc-400">{user?.emailAddresses[0].emailAddress}</p>
                                <p className="text-sm text-gray-600 dark:text-zinc-500 capitalize">{user.role} Account</p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="space-y-2">
                                <label htmlFor="fullName" className="block text-sm text-gray-700 dark:text-zinc-300">Full Name</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="fullName"
                                        value={profileData.firstName}
                                        onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                                        className="w-full sm:max-w-xs p-2 rounded-md bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                                    />
                                    <input
                                        id="lastName"
                                        value={profileData.lastName}
                                        onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                                        className="w-full sm:max-w-xs p-2 rounded-md bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="email" className="block text-sm text-gray-700 dark:text-zinc-300">Email Address</label>
                                <input
                                    id="email"
                                    value={user.emailAddresses[0].emailAddress}
                                    disabled
                                    className="w-full p-2 rounded-md bg-gray-200 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400"
                                />
                                <p className="text-xs text-gray-500 dark:text-zinc-400">
                                    Email cannot be changed. Contact support if you need to update it.
                                </p>
                            </div>

                            {user.fullName !== profileData.fullName && (
                                <button
                                    type="submit"
                                    disabled={isUpdating}
                                    className="flex items-center text-sm gap-2 px-5 py-2 rounded bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                                >
                                    <Save className="w-4 h-4" />
                                    {isUpdating ? "Saving..." : "Save Changes"}
                                </button>
                            )}
                        </form>
                    </div>
                )}

                {/* Account Tab */}
                {activeTab === "account" && (
                    <div className="bg-gray-100 dark:bg-zinc-950 dark:bg-gradient-to-br dark:from-zinc-800/70 dark:to-zinc-900/50 border border-gray-300 dark:border-zinc-800 rounded-lg p-6 space-y-6">
                        <h2 className="text-gray-900 dark:text-white text-lg font-semibold mb-4">Account Settings</h2>
                        <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg">
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Account Type</h4>
                            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-3">
                                Your account last signed in on {user.lastSignInAt.getDate()}/{user.lastSignInAt.getMonth()}/{user.lastSignInAt.getFullYear()}
                            </p>
                        </div>

                        <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
                            <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">Danger Zone</h4>
                            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4">
                                Once you disable your account, you'll need to create a new one.
                            </p>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white"
                            >
                                <LogOut className="w-4 h-4" />
                                Disable Account
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
