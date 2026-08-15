# One-time HEXDROP unified-physics migration loader.
from pathlib import Path
import base64,lzma
root=Path(__file__).resolve().parents[1]
payload="".join(p.read_text().strip() for p in sorted((root/"tools").glob("migrate-payload-*.txt")))
code=lzma.decompress(base64.b64decode(payload)).decode("utf-8")
exec(compile(code,__file__,"exec"),{"__name__":"__main__","__file__":__file__})
