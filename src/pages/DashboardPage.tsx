import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CategoryFilter, ALL_CATEGORIES } from "@/components/tasks/CategoryFilter"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskList } from "@/components/tasks/TaskList"
import { useJarvisData } from "@/contexts/JarvisDataContext"

export function DashboardPage() {
  const { tasksState } = useJarvisData()
  const { tasks, categories, loading, addTask, updateTask, deleteTask, toggleStatus, addCategory } =
    tasksState
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [newCategoryName, setNewCategoryName] = useState("")

  const filteredTasks =
    categoryFilter === ALL_CATEGORIES
      ? tasks
      : tasks.filter((t) => t.category_id === categoryFilter)

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    await addCategory(newCategoryName.trim())
    setNewCategoryName("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <CategoryFilter
          categories={categories}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <TaskFormDialog
          categories={categories}
          onSubmit={addTask}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Tâche
            </Button>
          }
        />
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nouvelle catégorie"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
        />
        <Button variant="outline" onClick={handleAddCategory}>
          Ajouter
        </Button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : (
        <TaskList
          tasks={filteredTasks}
          categories={categories}
          onToggle={toggleStatus}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}
    </div>
  )
}
