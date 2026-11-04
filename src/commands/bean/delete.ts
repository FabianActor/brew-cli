import { createDeleteCommand } from '../../lib/crudCommands.ts';
import { deleteBean } from '../../services/beans.ts';

export default createDeleteCommand({
  entity: 'bean',
  label: 'Bean',
  idDescription: 'Bean record ID.',
  deleteDescription: 'Soft-delete a coffee bean.',
  remove: deleteBean,
});
