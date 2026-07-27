const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  content = content.replace(/const updatePlanItem = useUpdatePlanItem\(\);/g, 'const queryClient = useQueryClient();\n  const updatePlanItem = useUpdatePlanItem({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/plans"] }) } });');
  content = content.replace(/const deletePlanItem = useDeletePlanItem\(\);/g, 'const deletePlanItem = useDeletePlanItem({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/plans"] }) } });');
  content = content.replace(/const replacePlaceholder = useReplacePlanPlaceholder\(\);/g, 'const replacePlaceholder = useReplacePlanPlaceholder({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/plans"] }) } });');
  
  if (content.includes('useQueryClient') && !content.includes('import { useQueryClient }')) {
    content = 'import { useQueryClient } from "@tanstack/react-query";\n' + content;
  }
  
  fs.writeFileSync(filepath, content);
}

patchFile('artifacts/scu-advising/src/components/degree-plan/CourseCard.tsx');
patchFile('artifacts/scu-advising/src/components/degree-plan/Board.tsx');
