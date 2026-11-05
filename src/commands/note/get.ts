import { createGetCommand } from '../../lib/crudCommands.ts';
import { getNote } from '../../services/notes.ts';

export default createGetCommand({
  entity: 'note',
  label: 'Note',
  idDescription: 'Note record ID.',
  getDescription: 'Show details for a specific brewing note.',
  fetch: getNote,
  imageFields: ['image'],
  describe: (note) => {
    const params = (note.params ?? {}) as Record<string, unknown>;
    const taste = (note.taste ?? {}) as Record<string, unknown>;
    const beanInfo = (note.coffeeBeanInfo ?? {}) as Record<string, unknown>;
    const tasteStr =
      Object.keys(taste).length > 0
        ? Object.entries(taste)
            .map(([key, value]) => `${key}:${value}`)
            .join(', ')
        : '-';

    return [
      `ID:          ${note.id}`,
      `Equipment:   ${note.equipment ?? ''}`,
      `Method:      ${note.method ?? ''}`,
      `Coffee:      ${params.coffee ?? ''}`,
      `Water:       ${params.water ?? ''}`,
      `Ratio:       ${params.ratio ?? ''}`,
      `Grind Size:  ${params.grindSize ?? ''}`,
      `Temperature: ${params.temp ?? ''}`,
      `Rating:      ${note.rating ?? '-'}`,
      `Taste:       ${tasteStr}`,
      `Bean:        ${beanInfo.name ?? ''}`,
      `Notes:       ${note.notes ?? ''}`,
    ];
  },
});
