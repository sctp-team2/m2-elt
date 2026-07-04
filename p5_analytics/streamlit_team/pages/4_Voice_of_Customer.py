"""Voice of the Customer — review free-text analysis (word clouds + n-grams).

Ported from the standalone ``../wordcloud`` app into the team deck. Analyses the
free-text fields of ``dim_reviews`` (comment title + message) from the gold mart.
Reviews are Brazilian Portuguese; a sidebar Language toggle translates the *displayed
terms* to English via the Cloud Translation API (falls back to Portuguese with a
warning if the API is unavailable). See lib/text.py for stopword handling and
lib/translate.py for the translation layer.
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from wordcloud import WordCloud

from lib import bq, queries
from lib import text as T
from lib import translate as Tr

st.set_page_config(page_title="Voice of Customer", page_icon="💬", layout="wide")

st.title("💬 Voice of the Customer — Review Text Analysis")
st.caption("What customers actually *say* — the qualitative evidence behind PP2 and PP3.")

try:
    df = bq.run_query(queries.REVIEWS_TEXT_SQL)
except Exception as e:  # noqa: BLE001
    st.error(f"Query failed — check the BigQuery connection on the Home page.\n\n{e}")
    st.stop()

# ---------------------------------------------------------------- sidebar ----
st.sidebar.header("Filters")

lang = st.sidebar.radio(
    "Language",
    ["Português (original)", "English (translated)"],
    index=0,
    help="English translates the displayed terms via Cloud Translation — for readers "
         "who don't read Portuguese. The underlying reviews are unchanged.",
)
ENGLISH = lang.startswith("English")

field = st.sidebar.radio(
    "Text field",
    ["message", "title", "both"],
    index=0,
    help="Which free-text field of dim_reviews to analyse.",
)

scores = sorted(int(s) for s in df["review_score"].dropna().unique())
sel_scores = st.sidebar.multiselect(
    "Review score (stars)", scores, default=scores,
    help="Restrict the analysis to reviews with these scores.",
)

max_words = st.sidebar.slider("Word cloud: max words", 50, 400, 200, step=50)


def text_series(frame: pd.DataFrame) -> pd.Series:
    """The chosen text field(s) as one non-empty string Series."""
    if field == "title":
        s = frame["title"]
    elif field == "message":
        s = frame["message"]
    else:  # both
        s = (frame["title"].fillna("") + " " + frame["message"].fillna("")).str.strip()
        s = s.replace("", pd.NA)
    return s.dropna()


# --------------------------------------------------- translation helpers ----
_translate_failed = False


def translate_freq(counter, top: int = 250) -> dict:
    """Token-frequency dict, translated to English (aggregating collisions) when in
    English mode. Falls back to Portuguese if the Translation API errors."""
    global _translate_failed
    items = counter.most_common(top) if hasattr(counter, "most_common") else list(counter)
    if not ENGLISH or _translate_failed:
        return dict(items)
    try:
        mapping = Tr.translate_terms(tuple(w for w, _ in items))
    except Exception:  # noqa: BLE001  API disabled / no permission — degrade to PT
        _translate_failed = True
        return dict(items)
    agg: dict[str, float] = {}
    for w, c in items:
        en = mapping.get(w, w)
        agg[en] = agg.get(en, 0) + c
    return agg


def translate_labels(labels: list[str]) -> list[str]:
    """Translate a list of phrase labels (e.g. bigrams) when in English mode."""
    global _translate_failed
    if not ENGLISH or _translate_failed or not labels:
        return labels
    try:
        mapping = Tr.translate_terms(tuple(labels))
    except Exception:  # noqa: BLE001
        _translate_failed = True
        return labels
    return [mapping.get(lbl, lbl) for lbl in labels]


# Apply the score filter, then derive the working text series.
fdf = df[df["review_score"].isin(sel_scores)] if sel_scores else df
texts = text_series(fdf)

# -------------------------------------------------------------------- KPIs ----
n_reviews = len(fdf)
n_msg = fdf["message"].notna().sum()
n_title = fdf["title"].notna().sum()
avg_score = fdf["review_score"].mean()

c1, c2, c3, c4 = st.columns(4)
c1.metric("Reviews (filtered)", f"{n_reviews:,}")
c2.metric("With a comment", f"{n_msg:,}", f"{n_msg / max(n_reviews, 1):.0%}")
c3.metric("With a title", f"{n_title:,}", f"{n_title / max(n_reviews, 1):.0%}")
c4.metric("Avg score", f"{avg_score:.2f} ★")

if texts.empty:
    st.warning("No non-empty text for the current filters. Widen the score selection.")
    st.stop()

# -------------------------------------------------------------- word cloud ----
st.subheader("Word cloud" + ("  ·  English" if ENGLISH else ""))


@st.cache_data(ttl=3600, show_spinner=False)
def cloud_image(freqs: dict, max_words: int, colormap: str = "viridis"):
    wc = WordCloud(
        width=1200, height=500, background_color="white",
        max_words=max_words, colormap=colormap,
    ).generate_from_frequencies(freqs)
    return wc.to_array()


freqs = translate_freq(T.freq(texts), top=max(max_words, 250))
if ENGLISH and _translate_failed:
    st.warning("Cloud Translation API unavailable — showing original Portuguese terms.")
st.image(cloud_image(freqs, max_words), use_container_width=True)

# ----------------------------------------------------- top words / bigrams ----
st.subheader("Most frequent terms")
col_w, col_b = st.columns(2)


def bar(items: list[tuple[str, float]], title: str):
    if not items:
        st.info("Not enough text.")
        return
    labels = [w for w, _ in items][::-1]
    values = [c for _, c in items][::-1]
    fig = go.Figure(go.Bar(x=values, y=labels, orientation="h", marker_color="#4f8cff"))
    fig.update_layout(height=520, margin=dict(t=40, b=10), title=title)
    st.plotly_chart(fig, use_container_width=True)


with col_w:
    word_items = sorted(freqs.items(), key=lambda kv: kv[1], reverse=True)[:20]
    bar(word_items, "Top 20 words")
with col_b:
    bigrams = T.top_bigrams(texts, 20)
    bg_labels = translate_labels([w for w, _ in bigrams])
    bar(list(zip(bg_labels, [c for _, c in bigrams])), "Top 20 bigrams")

# --------------------------------------------------- length vs. sentiment ----
st.subheader("Comment length & review score")

work = fdf.copy()
work["text"] = text_series(work).reindex(work.index)
work["length"] = work["text"].fillna("").str.len()
commented = work[work["length"] > 0]

col_l, col_s = st.columns(2)
with col_l:
    fig = go.Figure(go.Histogram(x=commented["length"].clip(upper=500), nbinsx=40,
                                 marker_color="#34d399"))
    fig.update_layout(height=380, margin=dict(t=40, b=10), bargap=0.05,
                      title="Comment length (chars, clipped at 500)",
                      xaxis_title="characters", yaxis_title="reviews")
    st.plotly_chart(fig, use_container_width=True)
with col_s:
    by_score = commented.groupby("review_score")["length"].mean()
    fig = go.Figure(go.Bar(x=by_score.index.astype(int).astype(str), y=by_score.values,
                           marker_color="#fb6a85"))
    fig.update_layout(height=380, margin=dict(t=40, b=10),
                      title="Avg comment length by score",
                      xaxis_title="review score (★)", yaxis_title="avg characters")
    st.plotly_chart(fig, use_container_width=True)
st.caption("🔍 Unhappy customers write *more* — 1★ comments run far longer than 5★ ones.")

# ---------------------------------------------- negative vs positive clouds ----
st.subheader("What drives bad vs. good reviews")
st.caption("Word clouds for low scores (1–2★) and high scores (4–5★), using the same field.")

col_neg, col_pos = st.columns(2)


def cloud_for(frame: pd.DataFrame, colormap: str):
    s = text_series(frame)
    if s.empty:
        st.info("No text in this score band.")
        return
    band_freqs = translate_freq(T.freq(s), top=200)
    if not band_freqs:
        st.info("No text in this score band.")
        return
    st.image(cloud_image(band_freqs, 120, colormap), use_container_width=True)


with col_neg:
    st.markdown("**Low scores (1–2★)**")
    cloud_for(df[df["review_score"].isin([1, 2])], "Reds")
with col_pos:
    st.markdown("**High scores (4–5★)**")
    cloud_for(df[df["review_score"].isin([4, 5])], "Greens")

st.caption(
    "🔍 The negative cloud is dominated by *delivery* language — \"não recebi\" (didn't "
    "receive), \"atraso\" (delay), \"ainda não chegou\" (still hasn't arrived) — not "
    "product-quality complaints. The customers are saying, verbatim, what PP2's numbers "
    "show."
)

# ------------------------------------------------------- sample comments ----
with st.expander("Sample comments"):
    sample = commented[["review_score", "title", "message"]].head(30)
    st.dataframe(sample, use_container_width=True, hide_index=True)

st.caption("Ported from `../wordcloud/` (standalone app) · gold mart `dim_reviews`, live BigQuery")
