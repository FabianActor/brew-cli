import { createGetCommand } from '../../lib/crudCommands.ts';
import { getBean } from '../../services/beans.ts';

export default createGetCommand({
  entity: 'bean',
  label: 'Bean',
  idDescription: 'Bean record ID.',
  getDescription: 'Show details for a specific coffee bean.',
  fetch: getBean,
  describe: (bean) => [
    `ID:          ${bean.id}`,
    `Name:        ${bean.name ?? ''}`,
    `Roaster:     ${bean.roaster ?? ''}`,
    `Roast Level: ${bean.roastLevel ?? ''}`,
    `Bean Type:   ${bean.beanType ?? ''}`,
    `Capacity:    ${bean.remaining ?? '0'}/${bean.capacity ?? '0'}`,
    `Price:       ${bean.price ?? ''}`,
    `Flavor:      ${Array.isArray(bean.flavor) ? (bean.flavor as string[]).join(', ') : ''}`,
    `Notes:       ${bean.notes ?? ''}`,
  ],
});
