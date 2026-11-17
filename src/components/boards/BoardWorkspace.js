'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  GripVertical,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { createSection, deleteSection, moveCard, renameSection } from '@/lib/board-actions';
import { formatDate, stripHtmlText } from '@/lib/format';
import { Avatar } from '@/components/ui/primitives';
import AppIcon from '@/components/ui/AppIcon';
import { FormMessage, TextField } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import TicketDialog, { CreateTicketDialog } from '@/components/boards/TicketDialog';

const priorityClasses = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  medium: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

function CardContent({ card, canViewTicketFields, canEdit, onOpen, dragHandleProps }) {
  const description = stripHtmlText(card.description);
  const assignee = card.assignees?.[0];
  const appIcon = card.app_icon_url || (card.app_icon_path ? `/api/apps/${card.app_id}/icon` : undefined);

  return (
    <div>
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-lg bg-[var(--primary-soft)] px-2 py-1.5 font-mono text-xs font-bold text-[var(--primary)]">
          #{String(card.ticket_number || '').padStart(3, '0')}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-base font-semibold leading-6 text-[var(--foreground)] hover:text-[var(--primary)]"
          aria-label={`Open card: ${card.title}`}
        >
          {card.title}
        </button>
        {canEdit && dragHandleProps && (
          <button
            type="button"
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            aria-label={`Drag card: ${card.title}`}
            title="Drag to move"
            className="btn btn-ghost btn-icon -mr-2 h-8 min-h-8 w-8 min-w-8 shrink-0 cursor-grab touch-none text-[var(--muted)] active:cursor-grabbing"
          >
            <GripVertical size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {description && (
        <p className="mt-4 line-clamp-2 min-h-12 text-sm leading-6 text-[var(--muted)]">{description}</p>
      )}
      {canViewTicketFields && card.app_name && (
        <div className="mt-3 flex min-w-0 items-center gap-3">
          <AppIcon name={card.app_name} src={appIcon} size="lg" />
          <span className="line-clamp-2 min-w-0 text-sm leading-5 text-[var(--muted)]">{card.app_name}</span>
        </div>
      )}
      {(canViewTicketFields || Number(card.comment_count) > 0) && (
        <div className="mt-4 flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {canViewTicketFields && card.priority && (
              <span className={`rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase ${priorityClasses[card.priority] || priorityClasses.medium}`}>
                {card.priority === 'urgent' ? 'Critical' : card.priority}
              </span>
            )}
            {canViewTicketFields && card.due_date && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--muted)]">
                <CalendarDays size={14} aria-hidden="true" />
                <span className="whitespace-nowrap">{formatDate(card.due_date)}</span>
              </span>
            )}
            {Number(card.comment_count) > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)]" aria-label={`${card.comment_count} comments`}>
                <MessageSquare size={16} aria-hidden="true" />
                {card.comment_count}
              </span>
            )}
          </div>
          {canViewTicketFields && assignee && (
            <span className="shrink-0 rounded-full ring-2 ring-[var(--surface)]" title={assignee.full_name} aria-label={`Assigned to ${assignee.full_name}`}>
              <Avatar
                name={assignee.full_name}
                src={assignee.avatar_path ? `/api/avatars/${assignee.id}` : undefined}
                size="lg"
                className="bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
              />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CardTile({ card, toneIndex, canEdit, canViewTicketFields, onOpen, draggingDisabled }) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: card.id,
    data: { sectionId: card.section_id },
    disabled: !canEdit || draggingDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`board-ticket group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--border-strong)] surface-tint-${['blue', 'green', 'amber', 'purple', 'red', 'cyan'][toneIndex % 6]}`}
    >
      <CardContent
        card={card}
        canViewTicketFields={canViewTicketFields}
        canEdit={canEdit}
        onOpen={onOpen}
        dragHandleProps={{ attributes, listeners }}
      />
    </article>
  );
}

function CardDragPreview({ card, canViewTicketFields }) {
  return (
    <article className="rotate-[1deg] rounded-2xl border border-[var(--primary)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-pop)]">
      <CardContent card={card} canViewTicketFields={canViewTicketFields} onOpen={() => {}} />
    </article>
  );
}

function BoardColumn({
  section,
  toneIndex,
  cards,
  canEdit,
  canDelete,
  canViewTicketFields,
  onOpenCard,
  onRename,
  onDelete,
  isSaving,
  isDropTarget,
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const { isOver, setNodeRef } = useDroppable({
    id: section.id,
    data: { sectionId: section.id, isSection: true },
  });

  async function submitRename(event) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setMessage('Enter a list name.');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      const result = await onRename(section.id, cleanTitle);
      if (result?.success) {
        setTitle('');
        setRenaming(false);
      } else {
        setMessage(result?.message || 'Could not rename this list.');
      }
    } catch (error) {
      console.error('Failed to rename a board list:', error);
      setMessage('Could not rename this list. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function removeSection() {
    const cardLabel = cards.length === 1 ? '1 card' : `${cards.length} cards`;
    if (!window.confirm(`Delete "${section.title}" and its ${cardLabel}? This also permanently deletes their comments, links, and attachments.`)) return;
    setPending(true);
    setMessage('');
    try {
      const result = await onDelete(section.id);
      if (!result?.success) {
        setMessage(result?.message || 'Could not delete this list.');
      }
    } catch (error) {
      console.error('Failed to delete a board list:', error);
      setMessage('Could not delete this list. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`${section.title} list`}
      className={`board-column board-column-tone-${toneIndex % 6} ${isOver || isDropTarget ? 'board-column-over' : ''}`}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        {renaming ? (
          <form onSubmit={submitRename} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              aria-label="List name"
              className="field min-h-9 px-2.5 py-1 text-sm font-semibold"
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
            <button type="submit" disabled={pending} className="btn btn-primary btn-icon min-h-9 min-w-9" aria-label="Save list name">
              <Check size={16} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => { setRenaming(false); setMessage(''); }} className="btn btn-ghost btn-icon min-h-9 min-w-9" aria-label="Cancel renaming">
              <X size={16} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              className={`min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--foreground)] ${canEdit ? 'hover:text-[var(--primary)]' : 'cursor-default'}`}
              onClick={() => {
                if (!canEdit) return;
                setTitle(section.title);
                setRenaming(true);
                setMessage('');
              }}
              aria-label={canEdit ? `Rename ${section.title} list` : section.title}
            >
              {section.title}
            </button>
            <span className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--muted)]">
              {cards.length}
            </span>
            {canDelete && (
              <button
                type="button"
                onClick={removeSection}
                disabled={pending || isSaving}
                className="btn btn-ghost btn-icon min-h-8 min-w-8 text-[var(--danger)]"
                aria-label={`Delete ${section.title} list`}
                title="Delete list"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </header>

      <div className="board-column-cards px-2 pb-2">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                toneIndex={toneIndex}
                canEdit={canEdit}
                canViewTicketFields={canViewTicketFields}
                onOpen={() => onOpenCard(card)}
                draggingDisabled={isSaving}
              />
            ))}
          </div>
        </SortableContext>
        {cards.length === 0 && (
          <p className="rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-5 text-center text-xs text-[var(--muted)]">
            No cards in this list yet.
          </p>
        )}
      </div>

      {message && (
        <p role="alert" className="mx-3 mb-2 flex items-center gap-1.5 text-xs text-[var(--danger)]">
          <AlertCircle size={13} aria-hidden="true" />
          {message}
        </p>
      )}

    </section>
  );
}

function BoardMemberAvatars({ board }) {
  return (
    <div className="hidden items-center -space-x-2 sm:flex" aria-label={`${board.board_members.length} board members`}>
      {board.board_members.slice(0, 4).map((member) => (
        <span key={member.profile_id} className="rounded-full ring-2 ring-[var(--bg)]" title={member.full_name || member.email}>
          <Avatar
            name={member.full_name || member.email}
            src={member.avatar_path ? `/api/avatars/${member.profile_id}` : undefined}
            size="sm"
          />
        </span>
      ))}
      {board.board_members.length > 4 && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--neutral)] text-[10px] font-semibold text-[var(--muted)] ring-2 ring-[var(--bg)]">
          +{board.board_members.length - 4}
        </span>
      )}
    </div>
  );
}

export default function BoardWorkspace({ initialBoard, initialCardId }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [dismissedInitialCardId, setDismissedInitialCardId] = useState(null);
  const [activeDragCard, setActiveDragCard] = useState(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dragOverSectionId, setDragOverSectionId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const cardsBySection = useMemo(() => {
    const grouped = new Map(board.sections.map((section) => [section.id, []]));
    for (const card of board.cards) {
      grouped.get(card.section_id)?.push(card);
    }
    return grouped;
  }, [board.cards, board.sections]);

  async function addSection(event) {
    event.preventDefault();
    try {
      const result = await createSection(board.id, newSectionTitle);
      if (result.success) {
        setAddingSection(false);
        setNewSectionTitle('');
        setMessage('');
        router.refresh();
      } else {
        setMessage(result.message || 'Could not add a list.');
      }
    } catch (error) {
      console.error('Failed to add a board list:', error);
      setMessage('Could not add a list. Check the connection and try again.');
    }
  }

  async function handleRename(sectionId, title) {
    try {
      const result = await renameSection(sectionId, title);
      if (result.success) router.refresh();
      return result;
    } catch (error) {
      console.error('Failed to rename a board list:', error);
      return { success: false, message: 'Could not rename this list. Check the connection and try again.' };
    }
  }

  async function handleDeleteSection(sectionId) {
    try {
      const result = await deleteSection(sectionId);
      if (result.success) router.refresh();
      return result;
    } catch (error) {
      console.error('Failed to delete a board list:', error);
      return { success: false, message: 'Could not delete this list. Check the connection and try again.' };
    }
  }

  async function handleDragEnd(event) {
    setActiveDragCard(null);
    setDragOverSectionId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || isSaving) return;

    const draggedCard = board.cards.find((card) => card.id === active.id);
    if (!draggedCard) return;
    const targetSectionId = over.data.current?.sectionId
      || board.sections.find((section) => section.id === over.id)?.id;
    if (!targetSectionId) return;

    const sourceCards = board.cards.filter((card) => card.section_id === draggedCard.section_id);
    const targetCards = draggedCard.section_id === targetSectionId
      ? sourceCards
      : board.cards.filter((card) => card.section_id === targetSectionId);
    const oldIndex = sourceCards.findIndex((card) => card.id === draggedCard.id);
    const overCardIndex = targetCards.findIndex((card) => card.id === over.id);
    let targetPosition;
    let reorderedSource = sourceCards;
    let reorderedTarget = targetCards;

    if (draggedCard.section_id === targetSectionId) {
      const newIndex = overCardIndex < 0 ? sourceCards.length - 1 : overCardIndex;
      if (newIndex === oldIndex) return;
      reorderedSource = arrayMove(sourceCards, oldIndex, newIndex);
      targetPosition = newIndex;
    } else {
      reorderedSource = sourceCards.filter((card) => card.id !== draggedCard.id);
      reorderedTarget = targetCards.filter((card) => card.id !== draggedCard.id);
      targetPosition = overCardIndex < 0 ? reorderedTarget.length : overCardIndex;
      reorderedTarget.splice(targetPosition, 0, { ...draggedCard, section_id: targetSectionId });
    }

    const updatedCards = board.cards.filter(
      (card) => card.section_id !== draggedCard.section_id && card.section_id !== targetSectionId
    );
    if (draggedCard.section_id === targetSectionId) {
      updatedCards.push(...reorderedSource);
    } else {
      updatedCards.push(...reorderedSource);
      updatedCards.push(...reorderedTarget);
    }
    const previousBoard = board;
    setBoard({
      ...board,
      cards: updatedCards.map((card) => ({
        ...card,
        position: card.section_id === draggedCard.section_id
          ? reorderedSource.findIndex((item) => item.id === card.id)
          : card.section_id === targetSectionId
            ? reorderedTarget.findIndex((item) => item.id === card.id)
            : card.position,
      })),
    });

    setIsSaving(true);
    setMessage('');
    try {
      const result = await moveCard(draggedCard.id, targetSectionId, targetPosition);
      setIsSaving(false);
      if (!result.success) {
        setBoard(previousBoard);
        setMessage(result.message || 'Could not move this card.');
        return;
      }
      router.refresh();
    } catch (error) {
      console.error('Failed to move a board card:', error);
      setIsSaving(false);
      setBoard(previousBoard);
      setMessage('Could not move this card. Check the connection and try again.');
    }
  }

  const activeCardId = initialCardId && initialCardId !== dismissedInitialCardId
    ? initialCardId
    : selectedCardId;
  const selectedCard = board.cards.find((card) => card.id === activeCardId) || null;
  const activeSection = selectedCard
    ? board.sections.find((section) => section.id === selectedCard.section_id)
    : null;

  function closeTicket() {
    setSelectedCardId(null);
    setDismissedInitialCardId(initialCardId);
    if (initialCardId) router.replace(`/tickets/${board.id}`, { scroll: false });
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-[28rem] flex-col gap-4 sm:h-[calc(100dvh-7rem)]">
      <div className="flex shrink-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Link href="/overview" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
            <ArrowLeft size={14} aria-hidden="true" />
            Workspace overview
          </Link>
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">{board.name}</h1>
              {!board.can_edit && <p className="mt-1 truncate text-sm text-[var(--muted)]">View only</p>}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
          <BoardMemberAvatars board={board} />
          {board.can_edit && (
            <CreateTicketDialog
              sections={board.sections}
              apps={board.apps}
              members={board.can_assign_workspace_members ? board.workspace_members : board.members}
              canAssignWorkspaceMembers={board.can_assign_workspace_members}
              canManageTicketFields={board.can_manage_ticket_fields}
              boardAppId={board.app_id}
            />
          )}
        </div>
      </div>

      {message && (
        <p role="alert" className="flex shrink-0 items-center gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          <AlertCircle size={16} aria-hidden="true" />
          {message}
        </p>
      )}
      <DndContext
        id={`board-${board.id}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={({ active }) => setActiveDragCard(board.cards.find((card) => card.id === active.id) || null)}
        onDragOver={({ over }) => {
          const sectionId = over?.data.current?.sectionId
            || board.sections.find((section) => section.id === over?.id)?.id
            || null;
          setDragOverSectionId(sectionId);
        }}
        onDragCancel={() => {
          setActiveDragCard(null);
          setDragOverSectionId(null);
        }}
        onDragEnd={handleDragEnd}
      >
        <div className="board-scroll" aria-label="Project stages">
          <div className="board-columns" style={{ '--board-column-count': Math.max(1, board.sections.length + (board.can_edit ? 1 : 0)) }}>
            {board.sections.map((section, index) => (
              <BoardColumn
                key={section.id}
                section={section}
                toneIndex={index}
                cards={cardsBySection.get(section.id) || []}
                canEdit={board.can_edit}
                canDelete={board.can_delete_sections}
                canViewTicketFields={board.can_view_ticket_fields}
                isSaving={isSaving}
                onOpenCard={(card) => {
                  setSelectedCardId(card.id);
                  setDismissedInitialCardId(initialCardId);
                  if (initialCardId) router.replace(`/tickets/${board.id}`, { scroll: false });
                }}
                onRename={handleRename}
                onDelete={handleDeleteSection}
                isDropTarget={dragOverSectionId === section.id}
              />
            ))}

            {board.can_edit && (
              addingSection ? (
                <form onSubmit={addSection} className={`board-column board-column-tone-${board.sections.length % 6} space-y-3 p-3`}>
                  <label htmlFor="new-section-title" className="text-sm font-semibold text-[var(--foreground)]">Add a list</label>
                  <TextField
                    id="new-section-title"
                    label="List name"
                    name="title"
                    value={newSectionTitle}
                    onChange={(event) => setNewSectionTitle(event.target.value)}
                    required
                    maxLength={80}
                    placeholder="Ready for review"
                    autoFocus
                  />
                  {message && <FormMessage state={{ success: false, message }} />}
                  <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary min-h-9 px-3 text-sm">Add list</button>
                    <button type="button" onClick={() => { setAddingSection(false); setMessage(''); }} className="btn btn-ghost btn-icon min-h-9 min-w-9" aria-label="Cancel adding list">
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingSection(true); setMessage(''); }}
                  className="board-add-list"
                >
                  <Plus size={17} aria-hidden="true" />
                  Add another list
                </button>
              )
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
          {activeDragCard ? (
            <CardDragPreview card={activeDragCard} canViewTicketFields={board.can_view_ticket_fields} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {isSaving && <p role="status" className="shrink-0 text-xs text-[var(--muted)]">Saving card order…</p>}

      <Modal
        open={Boolean(selectedCard)}
        onClose={closeTicket}
        title={selectedCard?.title || 'Ticket details'}
      >
        {selectedCard && (
          <TicketDialog
            key={selectedCard.id}
            card={selectedCard}
            apps={board.apps}
            members={board.can_assign_workspace_members ? board.workspace_members : board.members}
            canAssignWorkspaceMembers={board.can_assign_workspace_members}
            canManageTicketFields={board.can_manage_ticket_fields}
            boardAppId={board.app_id}
            canEdit={board.can_edit}
            onClose={closeTicket}
            onDeleted={closeTicket}
            onCommentAdded={() => {
              setBoard((current) => ({
                ...current,
                cards: current.cards.map((item) => item.id === selectedCard.id
                  ? { ...item, comment_count: Number(item.comment_count) + 1 }
                  : item),
              }));
            }}
          />
        )}
      </Modal>
    </div>
  );
}
