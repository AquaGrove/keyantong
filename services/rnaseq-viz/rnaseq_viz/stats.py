"""Welch t-test and Benjamini–Hochberg FDR. Standard library only."""

from __future__ import annotations

import math

_FPMIN = 1e-30
_EPS = 3e-12


def _betacf(a: float, b: float, x: float) -> float:
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _FPMIN:
        d = _FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, 201):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break
    return h


def regularized_beta(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lnbt = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1.0 - x)
    bt = math.exp(lnbt)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def student_t_two_tail(t: float, df: float) -> float:
    if df <= 0:
        return 1.0
    x = df / (df + t * t)
    p = regularized_beta(df / 2.0, 0.5, x)
    return max(0.0, min(1.0, p))


def welch(control: list[float], treat: list[float]) -> tuple[float, float, float]:
    """Return (t, two-tailed p, df). Means are treat minus control."""
    n1 = len(control)
    n2 = len(treat)
    if n1 < 2 or n2 < 2:
        raise ValueError("welch 需要每组至少 2 个重复")
    m1 = sum(control) / n1
    m2 = sum(treat) / n2
    v1 = sum((v - m1) ** 2 for v in control) / (n1 - 1)
    v2 = sum((v - m2) ** 2 for v in treat) / (n2 - 1)
    se2 = v1 / n1 + v2 / n2
    diff = m2 - m1
    if se2 < 1e-18:
        if abs(diff) < 1e-12:
            return 0.0, 1.0, float(n1 + n2 - 2)
        return math.copysign(1e6, diff), 0.0, float(n1 + n2 - 2)
    t = diff / math.sqrt(se2)
    df = (se2 * se2) / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
    return t, student_t_two_tail(t, df), df


def benjamini_hochberg(pvalues: list[float]) -> list[float]:
    m = len(pvalues)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda i: pvalues[i])
    adj = [1.0] * m
    running = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        running = min(running, pvalues[i] * m / rank)
        adj[i] = min(1.0, running)
    return adj
