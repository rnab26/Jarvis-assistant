import { Pencil, Plus, Trash2 } from "lucide-react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { LoadError } from "@/components/LoadError"
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog"
import { Button } from "@/components/ui/button"
import { useJarvisData } from "@/contexts/JarvisDataContext"

export function ContactsPage() {
  const { contactsState } = useJarvisData()
  const { contacts, loading, error, refresh, addContact, updateContact, deleteContact } =
    contactsState

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Qui est qui pour toi, et ce que Jarvis doit en savoir (relation, contexte, consignes).
        </p>
        <ContactFormDialog
          onSubmit={addContact}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Ajouter
            </Button>
          }
        />
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : contacts.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Aucun contact pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="flex-1 overflow-hidden">
                <p className="font-medium">{contact.name}</p>
                {contact.notes && (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {contact.notes}
                  </p>
                )}
              </div>
              <ContactFormDialog
                contact={contact}
                onSubmit={(input) => updateContact(contact.id, input)}
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Modifier">
                    <Pencil className="size-4" />
                  </Button>
                }
              />
              <ConfirmerAction
                titre="Supprimer ce contact ?"
                description={
                  <>
                    « {contact.name} » sera supprimé définitivement — Jarvis ne saura plus qui
                    c'est quand tu le nommeras.
                  </>
                }
                libelleConfirmation="Supprimer"
                onConfirmer={() => deleteContact(contact.id)}
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Supprimer">
                    <Trash2 className="size-4" />
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
