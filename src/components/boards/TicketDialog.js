'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileImage,
  FileUp,
  Link2,
  Paperclip,
  Trash2,
} from 'lucide-react';
import {
  addCardAttachment,
  addCardComment,
  addCardLink,
  createCard,
  deleteCard,
  deleteCardAttachment,
  deleteCardLink,
  getCardDetails,
  updateCard,
} from '@/lib/board-actions';
import { formatDate } from '@/lib/format';
import { Avatar } from '@/components/ui/primitives';
import AppIcon from '@/components/ui/AppIcon';
import { FormMessage, SelectField, TextField } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import RichTextEditor from '@/components/boards/RichTextEditor';

function dateInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function avatarSource(member) {
  return member.avatar_path ? `/api/avatars/${member.id}` : undefined;
}

function appIconSource(app) {
  if (!app) return undefined;
  return app.icon_url || (app.icon_path ? `/api/apps/${app.id}/icon` : undefined);
}

function fileSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TicketFields({
  title,
  description,
  priority,
  dueDate,
  appId,
  boardAppId,
  assignedIds,
  apps,
  members,
  canAssignWorkspaceMembers,
  canManageTicketFields,
  pending,
  allowNoApp,
  onAssigneeToggle,
  onDescriptionChange,
  onAppChange,
}) {
  const selectedApp = apps.find((app) => app.id === appId);
  const selectedIds = useMemo(() => new Set(assignedIds), [assignedIds]);
  const authorizedMembers = canAssignWorkspaceMembers
    ? members
    : members.filter((member) => member.is_board_member || member.is_board_app_member);
  const appOwnerIsAssignable = (app) => canAssignWorkspaceMembers
    || app.id === boardAppId
    || authorizedMembers.some((member) => member.id === app.assigned_user_id && member.is_board_member);
  const availableMembers = selectedApp
    ? authorizedMembers.filter((member) =>
      member.id === selectedApp.assigned_user_id && appOwnerIsAssignable(selectedApp)
    )
    : authorizedMembers;
  const availableApps = apps.filter((app) =>
    app.assigned_user_id
    && selectedIds.has(app.assigned_user_id)
    && authorizedMembers.some((member) => member.id === app.assigned_user_id)
    && appOwnerIsAssignable(app)
  );

  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        name="title"
        required
        maxLength={200}
        defaultValue={title}
        disabled={pending}
        data-autofocus=""
      />
      <RichTextEditor
        name="description"
        value={description}
        onChange={onDescriptionChange}
        disabled={pending}
      />
      {canManageTicketFields && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Priority" name="priority" defaultValue={priority} disabled={pending}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </SelectField>
            <TextField label="Due date" name="dueDate" type="date" defaultValue={dateInputValue(dueDate)} disabled={pending} />
          </div>
          <fieldset disabled={pending} className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Assigned members</legend>
        {availableMembers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-4 text-xs text-[var(--muted)]">
            Add members to this board before assigning the ticket.
          </p>
        ) : (
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
            {availableMembers.map((member) => (
              <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--neutral)]">
                <input
                  type="checkbox"
                  name="assigneeIds"
                  value={member.id}
                  checked={selectedIds.has(member.id)}
                  onChange={(event) => onAssigneeToggle(member.id, event.target.checked)}
                  disabled={member.status !== 'active' && !selectedIds.has(member.id)}
                  className="accent-[var(--primary)]"
                />
                <Avatar name={member.full_name || member.email} src={avatarSource(member)} size="sm" />
                <span className="min-w-0 truncate">
                  {member.full_name || member.email}
                  {member.status !== 'active' && <span className="ml-1 text-[10px] text-[var(--muted)]">(inactive)</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-xs text-[var(--muted)]">Select the user first. Their assigned apps will appear below.</p>
          </fieldset>
          <fieldset disabled={pending} className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-[var(--foreground)]">App</legend>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
          {allowNoApp && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--neutral)]">
              <input type="radio" name="appId" value="" checked={!appId} onChange={() => onAppChange('')} className="accent-[var(--primary)]" />
              <span>No application</span>
            </label>
          )}
          {availableApps.map((app) => (
            <label key={app.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--neutral)]">
              <input type="radio" name="appId" value={app.id} checked={appId === app.id} onChange={() => onAppChange(app.id)} className="accent-[var(--primary)]" />
              <AppIcon name={app.name} src={appIconSource(app)} size="sm" />
              <span className="min-w-0 truncate">{app.name}</span>
            </label>
          ))}
          {selectedIds.size === 0 && <p className="px-2 py-2 text-xs text-[var(--muted)]">Select a user above to see their assigned apps.</p>}
          {selectedIds.size > 0 && availableApps.length === 0 && <p className="px-2 py-2 text-xs text-[var(--muted)]">No apps are assigned to the selected user.</p>}
        </div>
          </fieldset>
          {selectedApp && (
            <p className="text-xs text-[var(--muted)]">
              This app belongs to {availableMembers.find((member) => member.id === selectedApp.assigned_user_id)?.full_name || 'the selected user'}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TicketForm({
  card,
  apps,
  members,
  canAssignWorkspaceMembers,
  canManageTicketFields,
  boardAppId,
  sections = [],
  pending,
  onSubmit,
  onCancel,
  error,
  submitLabel,
  formId,
  showActions = true,
}) {
  const [description, setDescription] = useState(card.description || '');
  const [appId, setAppId] = useState(card.app_id || '');
  const initialAssignedIds = card.assignees?.length
    ? card.assignees.map((member) => member.id)
    : card.assignee_id ? [card.assignee_id] : [];
  const appOwnerId = apps.find((app) => app.id === card.app_id)?.assigned_user_id;
  const [assignedIds, setAssignedIds] = useState(
    initialAssignedIds.length ? initialAssignedIds : appOwnerId ? [appOwnerId] : []
  );
  const priority = card.priority === 'urgent' ? 'critical' : card.priority || 'medium';

  function selectApp(nextAppId) {
    setAppId(nextAppId);
    const app = apps.find((item) => item.id === nextAppId);
    if (app?.assigned_user_id) setAssignedIds([app.assigned_user_id]);
  }

  function toggleAssignee(memberId, checked) {
    setAssignedIds((current) => checked
      ? [...new Set([...current, memberId])]
      : current.filter((id) => id !== memberId));
    if (!checked && apps.some((app) => app.id === appId && app.assigned_user_id === memberId)) {
      setAppId('');
    }
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-4">
      {!card.id && <input type="hidden" name="sectionId" value={card.section_id || sections[0]?.id || ''} />}
      <TicketFields
        title={card.title || ''}
        description={description}
        priority={priority}
        dueDate={card.due_date}
        appId={appId}
        boardAppId={boardAppId}
        assignedIds={assignedIds}
        apps={apps}
        members={members}
        canAssignWorkspaceMembers={canAssignWorkspaceMembers}
        canManageTicketFields={canManageTicketFields}
        pending={pending}
        allowNoApp={Boolean(card.id)}
        onAssigneeToggle={toggleAssignee}
        onDescriptionChange={setDescription}
        onAppChange={selectApp}
      />
      {error && <FormMessage state={{ success: false, message: error }} />}
      {showActions && (
        <div className="flex flex-col-reverse justify-end gap-2 border-t border-[var(--border)] pt-4 sm:flex-row">
          <button type="button" onClick={onCancel} disabled={pending} className="btn btn-secondary">Cancel</button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? 'Saving…' : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}

export function CreateTicketDialog({ sections, apps, members, canAssignWorkspaceMembers, canManageTicketFields, boardAppId, disabled }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const initialSection = sections[0]?.id || '';

  async function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const sectionId = String(formData.get('sectionId') || initialSection);
    setPending(true);
    setError('');
    try {
      const result = await createCard(sectionId, formData);
      if (!result.success) {
        setError(result.message || 'Could not create this ticket.');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      console.error('Failed to create a ticket:', submitError);
      setError('Could not create this ticket. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setError(''); setOpen(true); }} disabled={disabled || !sections.length} className="btn btn-primary">
        Create Ticket
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create Ticket" description="Add ticket details and manage its status on the board.">
        <TicketForm
          key={open ? 'new-ticket' : 'closed'}
          card={{ title: '', description: '', priority: 'medium', due_date: null, app_id: '', section_id: initialSection, assignees: [] }}
          apps={apps}
          members={members}
          canAssignWorkspaceMembers={canAssignWorkspaceMembers}
          canManageTicketFields={canManageTicketFields}
          boardAppId={boardAppId}
          sections={sections}
          pending={pending}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
          error={error}
          submitLabel="Create ticket"
        />
      </Modal>
    </>
  );
}

export default function TicketDialog({
  card: initialCard,
  apps,
  members,
  canAssignWorkspaceMembers,
  canManageTicketFields,
  boardAppId,
  canEdit,
  onClose,
  onDeleted,
  onCommentAdded,
}) {
  const router = useRouter();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(0);
  const commentInputRef = useRef(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    let active = true;
    getCardDetails(initialCard.id)
      .then((result) => {
        if (!active) return;
        if (result.success) setDetails(result.card);
        else setError(result.message || 'Could not load ticket details.');
      })
      .catch((loadError) => {
        console.error('Failed to load ticket details:', loadError);
        if (active) setError('Could not load ticket details. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [initialCard.id]);

  async function saveTicket(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await updateCard(initialCard.id, new FormData(event.currentTarget));
      if (!result.success) {
        setError(result.message || 'Could not save this ticket.');
        return;
      }
      router.refresh();
      onClose();
    } catch (saveError) {
      console.error('Failed to save a ticket:', saveError);
      setError('Could not save this ticket. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function removeTicket() {
    if (!window.confirm(`Delete "${details.title}"? This will remove its comments, links, and attachments.`)) return;
    setPending(true);
    setError('');
    try {
      const result = await deleteCard(initialCard.id);
      if (!result.success) {
        setError(result.message || 'Could not delete this ticket.');
        return;
      }
      if (result.message !== 'Ticket deleted.') window.alert(result.message);
      onDeleted();
      router.refresh();
    } catch (deleteError) {
      console.error('Failed to delete a ticket:', deleteError);
      setError('Could not delete this ticket. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await addCardComment(initialCard.id, commentText);
      if (!result.success) {
        setError(result.message || 'Could not add your comment.');
        return;
      }
      setDetails((current) => ({ ...current, comments: [...current.comments, result.comment] }));
      setCommentText('');
      setMentionQuery(null);
      onCommentAdded();
    } catch (commentError) {
      console.error('Failed to add a ticket comment:', commentError);
      setError('Could not add your comment. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function uploadFile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError('');
    try {
      const result = await addCardAttachment(initialCard.id, new FormData(form));
      if (!result.success) {
        setError(result.message || 'Could not upload this attachment.');
        return;
      }
      setDetails((current) => ({ ...current, attachments: [...current.attachments, result.attachment] }));
      form.reset();
    } catch (uploadError) {
      console.error('Failed to upload a ticket attachment:', uploadError);
      setError('Could not upload this attachment. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function submitLink(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await addCardLink(initialCard.id, linkTitle, linkUrl);
      if (!result.success) {
        setError(result.message || 'Could not add this link.');
        return;
      }
      setDetails((current) => ({ ...current, links: [...current.links, result.link] }));
      setLinkTitle('');
      setLinkUrl('');
    } catch (linkError) {
      console.error('Failed to add a ticket link:', linkError);
      setError('Could not add this link. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function removeAttachment(attachment) {
    setPending(true);
    setError('');
    try {
      const result = await deleteCardAttachment(attachment.id);
      if (!result.success) {
        setError(result.message || 'Could not remove this attachment.');
        return;
      }
      setDetails((current) => ({
        ...current,
        attachments: current.attachments.filter((item) => item.id !== attachment.id),
      }));
      if (result.message) setError(result.message);
    } catch (deleteError) {
      console.error('Failed to remove a ticket attachment:', deleteError);
      setError('Could not remove this attachment. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function removeLink(link) {
    setPending(true);
    setError('');
    try {
      const result = await deleteCardLink(link.id);
      if (!result.success) {
        setError(result.message || 'Could not remove this link.');
        return;
      }
      setDetails((current) => ({ ...current, links: current.links.filter((item) => item.id !== link.id) }));
    } catch (deleteError) {
      console.error('Failed to remove a ticket link:', deleteError);
      setError('Could not remove this link. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  const selectedApp = apps.find((app) => app.id === details?.app_id);
  const mentionSuggestions = mentionQuery === null
    ? []
    : (details?.mentionable_members || []).filter((member) => {
      const query = mentionQuery.trim().toLocaleLowerCase();
      return !query
        || String(member.full_name || '').toLocaleLowerCase().includes(query)
        || String(member.email || '').toLocaleLowerCase().includes(query);
    }).slice(0, 6);

  function updateCommentText(event) {
    const value = event.target.value;
    const cursor = event.target.selectionStart;
    const match = value.slice(0, cursor).match(/(^|\s)@([^\s@]*)$/u);
    setCommentText(value);
    if (!match) {
      setMentionQuery(null);
      return;
    }
    setMentionStart(cursor - match[0].length + match[1].length);
    setMentionQuery(match[2]);
  }

  function insertMention(member) {
    const input = commentInputRef.current;
    const cursor = input?.selectionStart ?? commentText.length;
    const name = member.full_name || member.email;
    const nextText = `${commentText.slice(0, mentionStart)}@${name} ${commentText.slice(cursor)}`;
    const nextCursor = mentionStart + name.length + 2;
    setCommentText(nextText);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <div className="space-y-5">
      {loading ? (
        <p role="status" className="py-6 text-center text-sm text-[var(--muted)]">Loading ticket details…</p>
      ) : !details ? (
        <FormMessage state={{ success: false, message: error || 'Ticket details are unavailable.' }} />
      ) : (
        <>
          {canEdit ? (
            <TicketForm
              key={`${details.id}-${details.updated_at}`}
              card={details}
              apps={apps}
              members={members}
              canAssignWorkspaceMembers={canAssignWorkspaceMembers}
              canManageTicketFields={canManageTicketFields}
              boardAppId={boardAppId}
              pending={pending}
              onSubmit={saveTicket}
              onCancel={onClose}
              error={error}
              submitLabel="Save changes"
              formId={`ticket-edit-form-${details.id}`}
              showActions={false}
            />
          ) : (
            <section className="space-y-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">{details.title}</h3>
              {details.description ? (
                <div className="rich-text-content text-sm leading-6" dangerouslySetInnerHTML={{ __html: details.description }} />
              ) : (
                <p className="text-sm text-[var(--muted)]">No description.</p>
              )}
              {canManageTicketFields && details.due_date && (
                <p className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                  <CalendarDays size={14} aria-hidden="true" />
                  Due {formatDate(details.due_date)}
                </p>
              )}
              {canManageTicketFields && selectedApp && (
                <div className="flex items-center gap-2">
                  <AppIcon name={selectedApp.name} src={appIconSource(selectedApp)} size="sm" />
                  <span className="text-sm text-[var(--foreground)]">{selectedApp.name}</span>
                </div>
              )}
            </section>
          )}

          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Paperclip size={16} aria-hidden="true" /> Attachments
            </h3>
            {details.attachments.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No attachments yet.</p>
            ) : (
              <ul className="space-y-2">
                {details.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-2.5">
                    {attachment.attachment_type === 'image' && attachment.available ? (
                      <a href={`/api/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="block h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--neutral)]" aria-label={`Preview ${attachment.filename} in a new tab`}>
                        <Image
                          src={`/api/attachments/${attachment.id}`}
                          alt={attachment.filename}
                          width={160}
                          height={128}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                        <FileImage size={20} aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">{attachment.filename}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {attachment.available
                          ? `${attachment.attachment_type === 'apk' ? 'APK' : attachment.attachment_type === 'file' ? 'File' : 'Image'} · ${fileSize(attachment.file_size)}`
                          : 'Legacy file unavailable; remove and upload it again.'}
                      </p>
                    </div>
                    {attachment.available && (
                      <a href={`/api/attachments/${attachment.id}`} download={attachment.filename} className="btn btn-ghost btn-icon min-h-9 min-w-9" aria-label={`Download ${attachment.filename}`} title="Download">
                        <Download size={15} aria-hidden="true" />
                      </a>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => removeAttachment(attachment)} disabled={pending} className="btn btn-ghost btn-icon min-h-9 min-w-9 text-[var(--danger)]" aria-label={`Remove ${attachment.filename}`}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form onSubmit={uploadFile} encType="multipart/form-data" className="space-y-2">
                <label htmlFor="ticket-file" className="block text-sm font-medium text-[var(--foreground)]">Upload a file</label>
                <div className="flex min-w-0 items-center gap-2">
                  <input id="ticket-file" name="file" type="file" required disabled={pending} className="field min-w-0 flex-1 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--primary)]" />
                  <button type="submit" disabled={pending} className="btn btn-secondary min-h-10 shrink-0">
                    <FileUp size={15} aria-hidden="true" /> Upload
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)]">Images up to 10 MB; other files up to 50 MB.</p>
              </form>
            )}
          </section>

          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <Link2 size={16} aria-hidden="true" /> External links
            </h3>
            {details.links.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No links yet.</p>
            ) : (
              <ul className="space-y-2">
                {details.links.map((link) => (
                  <li key={link.id} className="flex items-center gap-2 rounded-lg bg-[var(--neutral)] px-3 py-2">
                    <ExternalLink size={14} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
                    <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--primary)] hover:underline">{link.title}</a>
                    {canEdit && <button type="button" onClick={() => removeLink(link)} disabled={pending} className="btn btn-ghost btn-icon min-h-8 min-w-8 text-[var(--danger)]" aria-label={`Remove link ${link.title}`}><Trash2 size={14} /></button>}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form onSubmit={submitLink} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                <TextField label="Link title" value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} maxLength={120} required disabled={pending} placeholder="Design file" />
                <TextField label="URL" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} maxLength={2048} required disabled={pending} placeholder="https://…" />
                <button type="submit" disabled={pending} className="btn btn-secondary self-end">Add link</button>
              </form>
            )}
          </section>

          {canManageTicketFields && <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Assigned members</h3>
            {details.assignees.length ? (
              <div className="flex flex-wrap gap-2">
                {details.assignees.map((member) => (
                  <span key={member.id} title={member.full_name} className="inline-flex items-center gap-2 rounded-full bg-[var(--neutral)] py-1 pl-1 pr-3 text-xs text-[var(--foreground)]">
                    <Avatar name={member.full_name} src={avatarSource(member)} size="sm" />
                    {member.full_name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">No members assigned.</p>
            )}
          </section>}

          <section className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Activity</h3>
            {details.comments.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">No comments yet.</p>
            ) : (
              <ul className="max-h-56 space-y-3 overflow-y-auto">
                {details.comments.map((comment) => (
                  <li key={comment.id} className="flex gap-2.5">
                    <Avatar name={comment.author_name} src={comment.author_avatar_path ? `/api/avatars/${comment.author_id}` : undefined} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs font-semibold text-[var(--foreground)]">{comment.author_name}</span>
                        <span className="text-[10px] text-[var(--muted)]">{formatDate(comment.created_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[var(--muted)]">{comment.content}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {details.can_comment && (
              <form onSubmit={submitComment} className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="relative min-w-0 flex-1">
                  <label htmlFor="ticket-comment" className="sr-only">Write a comment</label>
                    <textarea
                      ref={commentInputRef}
                      id="ticket-comment"
                      className="field min-h-16 resize-y text-sm"
                      value={commentText}
                      onChange={updateCommentText}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setMentionQuery(null);
                      }}
                      maxLength={2000}
                      placeholder="Write a comment… Type @ to mention someone"
                      disabled={pending}
                    />
                    {mentionSuggestions.length > 0 && (
                      <ul role="listbox" aria-label="Mention a teammate" className="absolute bottom-full z-20 mb-2 max-h-52 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)]">
                        {mentionSuggestions.map((member) => (
                          <li key={member.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected="false"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => insertMention(member)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--neutral)]"
                            >
                              <Avatar name={member.full_name || member.email} src={member.avatar_path ? `/api/avatars/${member.id}` : undefined} size="sm" />
                              <span className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">{member.full_name || member.email}</span>
                              {member.full_name && <span className="max-w-40 truncate text-xs text-[var(--muted)]">{member.email}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button type="submit" disabled={pending || !commentText.trim()} className="btn btn-primary min-h-10 px-3 text-sm">Comment</button>
                </div>
                <p className="text-xs text-[var(--muted)]">Mention a teammate with @ to notify them.</p>
              </form>
            )}
          </section>

          {canManageTicketFields && (
            <div className="flex justify-start border-t border-[var(--border)] pt-4">
              <button type="button" onClick={removeTicket} disabled={pending} className="btn btn-ghost text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                <Trash2 size={15} aria-hidden="true" /> Delete ticket
              </button>
            </div>
          )}
        </>
      )}
      {!loading && error && <FormMessage state={{ success: false, message: error }} />}
      {!loading && details && canEdit && (
        <div className="flex flex-col-reverse justify-end gap-2 border-t border-[var(--border)] pt-4 sm:flex-row">
          <button type="button" onClick={onClose} disabled={pending} className="btn btn-secondary">Cancel</button>
          <button type="submit" form={`ticket-edit-form-${details.id}`} disabled={pending} className="btn btn-primary">
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
