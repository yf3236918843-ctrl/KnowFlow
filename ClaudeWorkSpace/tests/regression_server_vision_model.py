from pathlib import Path


SERVER_PATH = Path(r"D:\FIles\documents\Project FIles\PT\Project\web\server.py")


def main():
    text = SERVER_PATH.read_text(encoding="utf-8")
    if '"model_name": "doubao-vision"' in text:
        raise RuntimeError("server Vision route still uses deprecated doubao-vision model name")
    if '"model_name": "doubao-seed-2-0-pro-260215"' not in text:
        raise RuntimeError("server Vision route should use doubao-seed-2-0-pro-260215")
    print("PASS: server vision model regression")


if __name__ == "__main__":
    main()
