import os
import re

file_path = r'c:\projects\hrportal\src\services\dbService.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern for the injected block
# Note: Indentation varies, so we use \s*
pattern = r'(?s)\s*async getOvertimeApprovals.*?async updateVariableCompStatus.*?}\n\s*};'

# Replace with just };
# We need to preserve the }; that was originally there.
# Since my replacement was Target: "};" Replacement: "async... };", 
# the original }; is at the END of my block.
# So if I replace the WHOLE block with }; I should be back to normal.
new_content = re.sub(pattern, '};', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Fixed.")
