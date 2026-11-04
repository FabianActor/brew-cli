import { createDeleteCommand } from '../../lib/crudCommands.ts';
import { deleteEquipment } from '../../services/equipment.ts';

export default createDeleteCommand({
  entity: 'equipment',
  label: 'Equipment',
  idDescription: 'Equipment ID.',
  deleteDescription: 'Soft-delete equipment.',
  remove: deleteEquipment,
});
