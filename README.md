# session-status Plugin for Google Antigravity

Plugin hiển thị thanh Capsule đo lường Session Status (Context size, Cache read, Output tokens và Background Tasks) sau mỗi lượt phản hồi trong Google Antigravity.

## Tính năng
- 🧠 **Context Size**: Đo chính xác số token đầu vào mới theo thời gian thực từ `transcript.jsonl`.
- 💾 **Cache Read**: Đo lượng token được nạp tức thì từ bộ nhớ đệm Cache.
- 📤 **Output Tokens**: Đo số token câu trả lời do model sinh ra.
- ⚙️ **Background Tasks**: Đếm và giám sát các tác vụ ngầm đang chạy.
- 📊 **Thanh Capsule mini**: Tinh gọn, trực quan, tự đổi màu theo mức tiêu thụ context (🟢 <50k, 🟡 50-100k, 🟠 100-150k, 🔴 >150k).

## Cấu trúc Plugin
```
session-status/
├── plugin.json
├── hooks.json
├── README.md
└── scripts/
    └── status_footer.js
```

## Cài đặt trên máy mới
Clone repository này vào thư mục plugins toàn cục:
```bash
cd ~/.gemini/config/plugins
git clone git@github.com:ICCteam2024/session-status.git
```
Khởi động lại Antigravity IDE là plugin sẽ tự động hoạt động trên toàn bộ các workspace.
