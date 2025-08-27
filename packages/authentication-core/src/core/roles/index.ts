import { RoleHierarchy } from "./index.types";

const defaultRoleHierarchy: RoleHierarchy = {
	guest: {
		name: "Guest",
		level: 0,
		permissions: ["read:public"],
	},
	user: {
		name: "User",
		level: 1,
		inherits: ["guest"],
		permissions: ["read:own_profile"],
	},
	editor: {
		name: "Editor",
		level: 2,
		inherits: ["user"],
		permissions: ["edit:posts", "delete:own_posts"],
	},
	admin: {
		name: "Admin",
		level: 3,
		inherits: ["editor"],
		permissions: ["manage:users", "delete:any_post"],
	},
	superAdmin: {
		name: "Super Admin",
		level: 4,
		inherits: ["admin"],
		permissions: ["manage:system"],
	},
};

export const RolesManager = (
	roleHierarchy: RoleHierarchy = defaultRoleHierarchy
) => {
	return {
		getRoleHierarchy: () => roleHierarchy,
		listRoles: () => Object.keys(roleHierarchy),
	};
};
