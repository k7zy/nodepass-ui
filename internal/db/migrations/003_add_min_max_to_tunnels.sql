-- 向 Tunnel 表添加 min 和 max 列，允许为空
ALTER TABLE "Tunnel" ADD COLUMN min INTEGER;
ALTER TABLE "Tunnel" ADD COLUMN max INTEGER; 