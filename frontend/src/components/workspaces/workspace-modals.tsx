import { useEffect, useState } from 'react'
import { AlertDialog, Button, Dialog } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import type { WorkspaceItem } from '../../services/workspace-service'

type RenameProps = {
  target: WorkspaceItem | null
  onClose: () => void
  onConfirm: (workspace: WorkspaceItem, newName: string) => Promise<void>
}

export function WorkspaceRenameModal({ target, onClose, onConfirm }: RenameProps) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) setValue(target.name)
  }, [target])

  async function submit() {
    if (!target) return
    const next = value.trim()
    if (!next) {
      toast.error('Enter a workspace name')
      return
    }
    if (next === target.name) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await onConfirm(target, next)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not rename workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Content size="2" style={{ maxWidth: 420 }}>
        <Dialog.Title>Rename workspace</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          {target ? (
            <>
              Update the name of{' '}
              <span className="font-medium text-neutral-800">“{target.name}”</span>. Files stay in
              this workspace.
            </>
          ) : null}
        </Dialog.Description>
        <label htmlFor="workspace-rename-input" className="sr-only">
          Workspace name
        </label>
        <input
          id="workspace-rename-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mb-4 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400"
          maxLength={200}
          autoComplete="off"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Dialog.Close>
            <Button type="button" variant="soft" color="gray" disabled={busy}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}

type DeleteProps = {
  target: WorkspaceItem | null
  onClose: () => void
  onConfirm: (workspace: WorkspaceItem) => Promise<void>
}

export function WorkspaceDeleteModal({ target, onClose, onConfirm }: DeleteProps) {
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!target) return
    setBusy(true)
    try {
      await onConfirm(target)
      onClose()
    } catch {
      toast.error('Could not delete workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialog.Content size="2" style={{ maxWidth: 440 }}>
        <AlertDialog.Title>Delete this workspace?</AlertDialog.Title>
        <AlertDialog.Description size="2" color="gray" mb="3">
          {target ? (
            <>
              <span className="font-medium text-neutral-800">“{target.name}”</span> and everything
              inside it will be removed: all files (storage and search index when no other copy
              exists) and related timeline entries. This cannot be undone.
            </>
          ) : null}
        </AlertDialog.Description>
        <div className="flex justify-end gap-2">
          <AlertDialog.Cancel>
            <Button type="button" variant="soft" color="gray" disabled={busy}>
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button type="button" color="red" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Deleting…' : 'Delete workspace'}
          </Button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
