import { authenticateToken, authorizePermissions } from "../../middleware/safety/auth.middleware.js";
import * as adminController from "../../module/admin/admin.controller.js";
import { validatePassword, validateRole, validateUserPatch } from "../../module/admin/admin.middleware.js";
import { Router } from "../../utils/http/http.util.js";

const router = new Router();
const panel = authorizePermissions("admin.access");
const manageRoles = authorizePermissions("roles.manage");

router.get("/admin/stats", authenticateToken, panel, adminController.stats);
router.get("/admin/rooms", authenticateToken, panel, adminController.rooms);

router.get("/admin/users", authenticateToken, authorizePermissions("users.view"), adminController.users);
// assigning roles needs users.manage and banning needs users.ban — checked in the service per field
router.patch("/admin/users/:id", authenticateToken, panel, validateUserPatch, adminController.updateUser);
router.post("/admin/users/:id/password", authenticateToken, panel, validatePassword, adminController.setUserPassword);

router.get("/admin/roles", authenticateToken, panel, adminController.roles);
router.post("/admin/roles", authenticateToken, manageRoles, validateRole, adminController.createRole);
router.patch("/admin/roles/:id", authenticateToken, manageRoles, validateRole, adminController.updateRole);
router.delete("/admin/roles/:id", authenticateToken, manageRoles, adminController.deleteRole);

export default router;
