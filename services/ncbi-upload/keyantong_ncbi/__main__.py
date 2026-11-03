import json, sys
from .validators import validate_submission

def main():
    payload = json.load(sys.stdin)
    print(json.dumps(validate_submission(payload).to_dict(), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
