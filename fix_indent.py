import os

file_path = r'c:\projects\hrportal\src\services\dbService.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_db_service = False
for i, line in enumerate(lines):
    # Detect start of dbService
    if 'export const dbService = {' in line:
        in_db_service = True
        new_lines.append(line)
        continue
    
    # Detect early closure at line 1319 (0-indexed 1318)
    # We want to change "    }," to "      }," or "    }," if it was a method end.
    # Actually, if it's at 4 spaces, it's closing the object.
    if in_db_service and i == 1318 and line.strip() == '},':
        new_lines.append('    },\n') # Keep it indented but don't close the object yet? 
        # Actually, if we want it to be a method end, it should be at 6 spaces.
        # But wait, the methods before it were at 6 spaces.
        continue

    # Indent the block that was left outside
    if i >= 1320 and i <= 1979:
        # Avoid double indenting if already indented
        if line.startswith('    ') and not line.startswith('      '):
             new_lines.append('  ' + line)
        else:
             new_lines.append(line)
        continue
    
    # Fix the closure at 1980
    if i == 1979:
        new_lines.append('    },\n')
        continue
        
    new_lines.append(line)

# Add closing for dbService at the very end
new_lines.append('  };\n')

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Indentation fixed.")
