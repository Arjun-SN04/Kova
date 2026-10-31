import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { createTask, deleteTask, listTasks, updateTask } from "../controller/task.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/group/:groupId", listTasks)
router.post("/", createTask)
router.put("/:id", updateTask)
router.delete("/:id", deleteTask)
export default router
