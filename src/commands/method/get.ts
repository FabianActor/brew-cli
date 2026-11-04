import { createGetCommand } from '../../lib/crudCommands.ts';
import { getMethod } from '../../services/methods.ts';

export default createGetCommand({
  entity: 'method',
  label: 'Method',
  idDescription: 'Method ID.',
  getDescription: 'Show details for a specific method including stages.',
  fetch: getMethod,
  describe: (method) => {
    const params = (method.params ?? {}) as Record<string, unknown>;
    const stages = Array.isArray(params.stages) ? params.stages : [];

    const lines = [
      `ID:          ${method.id}`,
      `Name:        ${method.name ?? ''}`,
      `Equipment:   ${method._equipmentId ?? ''}`,
      `Coffee:      ${params.coffee ?? ''}`,
      `Water:       ${params.water ?? ''}`,
      `Ratio:       ${params.ratio ?? ''}`,
      `Grind Size:  ${params.grindSize ?? ''}`,
      `Temperature: ${params.temp ?? ''}`,
    ];

    if (stages.length > 0) {
      lines.push('', 'Stages:');
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i] as Record<string, unknown>;
        lines.push(
          `  ${i + 1}. ${stage.label ?? ''} | ${stage.pourType ?? ''} | ${stage.water ?? ''} | ${stage.duration ?? 0}s`,
        );
      }
    }

    return lines;
  },
});
