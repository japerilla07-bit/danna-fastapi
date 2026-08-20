import random, math
from danna_core.engine import get_wheel_expert_info, _WHEEL_EXPERT, compute_mesa_score_simple

random.seed(2)
spins = [random.randint(0, 36) for _ in range(60)]
for _ in range(400):
    info = get_wheel_expert_info(spins)
    n = random.randint(0, 36)
    spins.append(n)
    _WHEEL_EXPERT.register_outcome(info["active_sector"], n)

w = _WHEEL_EXPERT.adaptive_weight()
last = _WHEEL_EXPERT._hit_history[-1]
ms = compute_mesa_score_simple(spins)
s10 = ms.get("score10")

print("peso wheel:", round(w, 4))
print("hit_history:", type(last).__name__)
print("radar score10:", s10)
print("VEREDICTO:", "OK" if (0.05 <= w <= 0.50 and isinstance(last, tuple)
                             and isinstance(s10, int) and 1 <= s10 <= 10) else "REVISAR")
