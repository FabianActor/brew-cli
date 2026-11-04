import { createGetCommand } from '../../lib/crudCommands.ts';
import { getEquipment } from '../../services/equipment.ts';

export default createGetCommand({
  entity: 'equipment',
  label: 'Equipment',
  idDescription: 'Equipment ID.',
  getDescription: 'Show details for specific equipment.',
  fetch: getEquipment,
  describe: (eq) => [
    `ID:    ${eq.id}`,
    `Name:  ${eq.name ?? ''}`,
    `Type:  ${eq.animationType ?? ''}`,
    `Valve: ${eq.hasValve ? 'yes' : 'no'}`,
    `Note:  ${eq.note ?? ''}`,
  ],
});
