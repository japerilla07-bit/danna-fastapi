import random, json
from danna_core.engine import compute_mesa_score_simple
random.seed(3)
sp = [random.randint(0, 36) for _ in range(40)]
ms = compute_mesa_score_simple(sp)
print("window:", ms["window"], "| min_spins:", ms["min_spins"], "| score10:", ms["score10"])
print("descriptive:", json.dumps(ms["descriptive"], ensure_ascii=False))
print("VEREDICTO:", "OK" if (ms["window"] == 14 and ms["descriptive"]["n"] == 14) else "REVISAR")
