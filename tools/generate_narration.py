# Generate the Vietnamese narration audio with Edge TTS.
# We split the script into short segments and use rate cues per
# segment so the voice has natural rises and falls rather than a
# flat TTS read.
#
# Edge TTS rate-limits aggressively per session token. The
# "NoAudioReceived" error fires on consecutive calls within ~3s, so
# we sleep between requests and retry with backoff. viem-style
# streams can only be iterated once, so each retry constructs a
# fresh `Communicate`.

import asyncio
import io
import sys

import edge_tts

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# Script: 6 scenes that map 1:1 to the video timeline.
# Each tuple is (filename, text, rate_cue).
# rate_cue is the `rate` value passed to Edge TTS.
SEGMENTS = [
    # Scene 1: 0-10s — Hook
    (
        "01_hook.wav",
        "Xin chào, và chào mừng bạn đến với Pharos Multi-Agent Job Router.",
        "+0%",
    ),
    (
        "02_hook.wav",
        "Một hệ thống điều phối phân tán, nơi các tác vụ được giao cho những tác nhân đủ năng lực, "
        "và kết quả được neo cứng trên blockchain Pharos Atlantic.",
        "-3%",
    ),
    # Scene 2: 10-25s — Problem
    (
        "03_problem.wav",
        "Trong thế giới AI, nhiều mô hình ngôn ngữ lớn cùng phối hợp để giải quyết những bài toán phức tạp.",
        "+0%",
    ),
    (
        "04_problem.wav",
        "Nhưng làm sao biết tác nhân nào đáng tin? Kết quả nào đúng? Và ai chịu trách nhiệm?",
        "+5%",
    ),
    (
        "05_problem.wav",
        "Đó chính là bài toán mà Pharos Job Router giải quyết.",
        "-5%",
    ),
    # Scene 3: 25-40s — What we built
    (
        "06_solution.wav",
        "Chúng tôi xây dựng một bộ điều phối gồm bảy package và hai service, "
        "tổng cộng hơn tám mươi bốn bài kiểm thử tự động, và chín mươi mốt phần trăm độ phủ.",
        "+0%",
    ),
    (
        "07_solution.wav",
        "Mọi tác vụ đều được biên dịch thành đồ thị có hướng không chu trình, "
        "rồi chọn tác nhân theo năng lực, độ tin cậy, chi phí và độ trễ.",
        "-3%",
    ),
    (
        "08_solution.wav",
        "CertiK duyệt mỗi bản phát hành kỹ năng. CertiK xác minh chữ ký số từng nhịp tim.",
        "+0%",
    ),
    # Scene 4: 40-55s — Architecture
    (
        "09_arch.wav",
        "Receipt cuối cùng của mỗi công việc được neo trên hợp đồng thông minh JobRouterRegistry, "
        "tại địa chỉ đã được triển khai trên Pharos Atlantic, chainId sáu tám tám sáu tám chín.",
        "-3%",
    ),
    (
        "10_arch.wav",
        "Mỗi nhiệm vụ có root riêng. Bạn có thể xác minh độc lập từ đầu đến cuối, "
        "không cần tin tưởng bất kỳ bên trung gian nào.",
        "+0%",
    ),
    # Scene 5: 55-70s — Live demo
    (
        "11_demo.wav",
        "Bản demo đang chạy trên Render. Một click, hệ thống tự chạy qua bốn tác vụ, "
        "neo kết quả lên chain, và trả về biên nhận có thể xác minh.",
        "+0%",
    ),
    (
        "12_demo.wav",
        "Bạn có thể mở explorer của Pharos Atlantic, dán địa chỉ biên nhận, "
        "và xem toàn bộ lịch sử tác vụ trên blockchain.",
        "-3%",
    ),
    # Scene 6: 70-80s — Closing
    (
        "13_close.wav",
        "Mã nguồn mở. Giấy phép MIT. Một trăm bốn mươi mốt commit, chín mươi mốt phần trăm độ phủ kiểm thử.",
        "+0%",
    ),
    (
        "14_close.wav",
        "Cảm ơn bạn đã theo dõi. Hẹn gặp lại trên GitHub.",
        "-5%",
    ),
]

VOICE = "vi-VN-NamMinhNeural"
OUT_DIR = "D:/pharos-future-ideas/04-multi-agent-job-router/tools/video/assets/audio"
SLEEP_BETWEEN = 3  # seconds, to stay below Edge TTS rate limit


async def save_with_retry(
    text: str,
    voice: str,
    rate: str,
    pitch: str,
    path: str,
    attempts: int = 8,
) -> None:
    """Save with retry on Edge TTS rate limiting. The 'NoAudioReceived'
    error fires on consecutive calls within ~3s; the upstream service
    rate-limits per session token, so retries with backoff reliably
    succeed. Each attempt constructs a fresh `Communicate` because
    viem-style streams can only be iterated once. Backoff is aggressive
    (10s, 20s, 40s, ...) because the rate-limit window is long."""
    for attempt in range(attempts):
        comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        try:
            await comm.save(path)
            return
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == attempts - 1:
                raise
            wait = 10 * (2**attempt)
            print(
                f"  rate-limited, retrying in {wait}s (attempt {attempt + 1}/{attempts})"
            )
            await asyncio.sleep(wait)


async def main() -> None:
    for i, (filename, text, tuning) in enumerate(SEGMENTS):
        out_path = f"{OUT_DIR}/{filename}"
        await save_with_retry(text, VOICE, tuning, "+0Hz", out_path)
        print(f"wrote {out_path}")
        if i < len(SEGMENTS) - 1:
            await asyncio.sleep(SLEEP_BETWEEN)


asyncio.run(main())
