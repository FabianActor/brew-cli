import { createDeleteCommand } from '../../lib/crudCommands.ts';
import { deleteNote } from '../../services/notes.ts';

export default createDeleteCommand({
  entity: 'note',
  label: 'Note',
  idDescription: 'Note record ID.',
  deleteDescription: 'Soft-delete a brewing note.',
  remove: deleteNote,
});
