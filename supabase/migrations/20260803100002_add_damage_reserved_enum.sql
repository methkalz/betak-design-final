-- ============================================================================
-- بيتك ديزاين — 0030 — قيمة movement_type الجديدة damage_reserved
-- ملف مستقل: قيمة enum لا تُستخدم في معاملة إضافتها.
--
-- القرار المحسوم (DECISIONS §8/§9): تلف الكمية المحجوزة حركة مستقلة بأثر
-- (on_hand −1، reserved −1) — لا حركتَي damage + reservation_release، لأن
-- التلف ليس تحريرًا ولا يجوز أن يظهر في تقارير الكميات المحررة.
--
--   damage           تلف من المخزون المتاح:  on_hand ↓  reserved ثابت
--   damage_reserved  تلف من كمية محجوزة:     on_hand ↓  reserved ↓  available ثابت
-- ============================================================================

alter type core.movement_type add value if not exists 'damage_reserved' after 'damage';
