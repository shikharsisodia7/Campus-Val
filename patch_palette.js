const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  content = content.replace(/const addPlanItem = useAddPlanItem\(\);/g, 'const queryClient = useQueryClient();\n  const addPlanItem = useAddPlanItem();'); // wait I'll inject the success inside the mutate call directly instead
  fs.writeFileSync(filepath, content);
}
patchFile('artifacts/scu-advising/src/components/degree-plan/Palette.tsx');
