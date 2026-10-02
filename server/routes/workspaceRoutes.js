import express from "express";
import { getUserWorkspaces, deleteWorkspace, createWorkspace } from "../controllers/workspaceController.js";

const workspaceRouter = express.Router();

workspaceRouter.get("/", getUserWorkspaces);
workspaceRouter.post("/", createWorkspace);
workspaceRouter.delete("/:id", deleteWorkspace);

export default workspaceRouter;
