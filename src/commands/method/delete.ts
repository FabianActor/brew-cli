import { createDeleteCommand } from '../../lib/crudCommands.ts';
import { deleteMethod } from '../../services/methods.ts';

export default createDeleteCommand({
  entity: 'method',
  label: 'Method',
  idDescription: 'Method ID.',
  deleteDescription: 'Delete a brewing method.',
  remove: deleteMethod,
});
