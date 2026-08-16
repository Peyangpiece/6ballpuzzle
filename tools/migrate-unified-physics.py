# One-time HEXDROP unified-physics migration loader v5.
from pathlib import Path
import base64,lzma
root=Path(__file__).resolve().parents[1]
payload="".join(p.read_text().strip() for p in sorted((root/"tools").glob("migrate-payload-*.txt")))
code=lzma.decompress(base64.b64decode(payload)).decode("utf-8")
old="""settle_start=old_step.index('        if (g.phase === \"SETTLE\") {')
check_start=old_step.index('        if (g.phase === \"CHECK\") {',settle_start)
"""
new="""settle_start=old_step.index('        if (g.phase === \"SETTLE\") {')
settle_brace=old_step.index('{',settle_start)
_fake_prefix='function __settle_block__() '
_fake=_fake_prefix+old_step[settle_brace:]
_,_fake_end=function_bounds(_fake,'__settle_block__')
settle_end=settle_brace+(_fake_end-len(_fake_prefix))
"""
if old not in code: raise RuntimeError('stepEngine migration patch target missing')
code=code.replace(old,new,1)
code=code.replace("new_step=old_step[:settle_start]+new_settle+old_step[check_start:]","new_step=old_step[:settle_start]+new_settle+old_step[settle_end:]",1)
code=code.replace("core=replace_function(core,'stepEngine',new_step)\nsyntax_check('stepEngine',core)","syntax_check('new_step_only',new_step)\nif old_step not in core: raise RuntimeError('exact stepEngine source missing')\ncore=core.replace(old_step,new_step,1)\nsyntax_check('stepEngine',core)",1)
exec(compile(code,__file__,"exec"),{"__name__":"__main__","__file__":__file__})
