import random
from danna_core.engine import get_wheel_expert_info, _WHEEL_EXPERT

random.seed(1)
spins = [random.randint(0, 36) for _ in range(60)]
for _ in range(400):
    info = get_wheel_expert_info(spins)
    n = random.randint(0, 36)
    spins.append(n)
    _WHEEL_EXPERT.register_outcome(info["active_sector"], n)

w = _WHEEL_EXPERT.adaptive_weight()
last = _WHEEL_EXPERT._hit_history[-1]
print("peso final:", round(w, 4))
print("tipo en _hit_history:", type(last).__name__, "->", last)
print("VEREDICTO:", "OK" if (0.10 < w < 0.45 and isinstance(last, tuple)) else "REVISAR")
