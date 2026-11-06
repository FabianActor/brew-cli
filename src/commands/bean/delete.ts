import { createDeleteCommand } from '../../lib/crudCommands.ts';
import { isGreenBean, rejectGreenBean } from '../../lib/greenBeans.ts';
import { deleteBean, getBean } from '../../services/beans.ts';

export default createDeleteCommand({
  entity: 'bean',
  label: 'Bean',
  idDescription: 'Bean record ID.',
  deleteDescription: 'Soft-delete a coffee bean.',
  // 生豆不支持任何写操作：先看一眼状态再删（App 里生豆要经过烘焙流程才会消失）。
  remove: async (supabase, id, userId) => {
    const bean = await getBean(supabase, id, userId);
    if (bean && isGreenBean(bean)) rejectGreenBean();
    return deleteBean(supabase, id, userId);
  },
});
