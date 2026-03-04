import os

file_path = r'c:\projects\hrportal\src\services\dbService.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the duplicate closers
content = content.replace('};};', '};')
content = content.replace('}};', '};')
# Sometimes it might be }; };
content = content.replace('}; };', '};')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Second pass fixed.")
