export type TaskStatus = "todo" | "done"

export interface Category {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  category_id: string | null
  title: string
  notes: string | null
  due_date: string | null
  status: TaskStatus
  created_at: string
  updated_at: string
}

export interface TaskInput {
  title: string
  notes: string | null
  due_date: string | null
  category_id: string | null
  status: TaskStatus
}
