import { useEffect, useState } from 'react'
import { AlertDialog, Button, Dialog } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import type { FileItem } from '../../types/file'

type Props = {
  renameTarget: FileItem | null
  deleteTarget: FileItem | null
  onCloseRename: () => void
  onCloseDelete: () => void
  onRenameConfirm: (file: FileItem, newName: string) => Promise<void>
  onDeleteConfirm: (file: FileItem) => Promise<void>
}

// rename + delete as radix dialogs; parent owns which file is targeted
export function FileRenameDeleteModals({
  renameTarget,
  deleteTarget,
  onCloseRename,
  onCloseDelete,
  onRenameConfirm,
  onDeleteConfirm,
}: Props) {
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    if (renameTarget) setRenameValue(renameTarget.name)
  }, [renameTarget])

  async function submitRename() {
    if (!renameTarget) return
    const next = renameValue.trim()
    if (!next) {
      toast.error('Enter a file name')
      return
    }
    if (next === renameTarget.name) {
      onCloseRename()
      return
    }
    setRenameBusy(true)
    try {
      await onRenameConfirm(renameTarget, next)
      onCloseRename()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rename file')
    } finally {
      setRenameBusy(false)
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await onDeleteConfirm(deleteTarget)
      onCloseDelete()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete file')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <Dialog.Root
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) onCloseRename()
        }}
      >
        <Dialog.Content size="2" style={{ maxWidth: 420 }}>
          <Dialog.Title>Rename file</Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="3">
            Update the display name. The file stays in the same workspace.
          </Dialog.Description>
          <label htmlFor="file-rename-input" className="sr-only">
            New file name
          </label>
          <input
            id="file-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="mb-4 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
            maxLength={500}
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitRename()
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray" disabled={renameBusy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="button" disabled={renameBusy} onClick={() => void submitRename()}>
              {renameBusy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) onCloseDelete()
        }}
      >
        <AlertDialog.Content size="2" style={{ maxWidth: 420 }}>
          <AlertDialog.Title>Delete file?</AlertDialog.Title>
          <AlertDialog.Description size="2" color="gray" mb="4">
            {deleteTarget ? (
              <>
                <span className="font-medium text-neutral-800">“{deleteTarget.name}”</span> will be
                removed from storage and search. This cannot be undone.
              </>
            ) : null}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel>
              <Button type="button" variant="soft" color="gray" disabled={deleteBusy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              color="red"
              disabled={deleteBusy}
              onClick={() => void submitDelete()}
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}
