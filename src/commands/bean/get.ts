import { createGetCommand } from '../../lib/crudCommands.ts';
import { isGreenBean, rejectGreenBean } from '../../lib/greenBeans.ts';
import { getBean } from '../../services/beans.ts';

export default createGetCommand({
  entity: 'bean',
  label: 'Bean',
  idDescription: 'Bean record ID.',
  getDescription: 'Show details for a specific coffee bean.',
  fetch: getBean,
  imageFields: ['image', 'backImage'],
  // 生豆在 CLI 里整体关闭：连读都不给，避免把 App 里两种「没烘焙日期的豆」混成一回事。
  guard: (bean) => {
    if (isGreenBean(bean)) rejectGreenBean();
  },
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
