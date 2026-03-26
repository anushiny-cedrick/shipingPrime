-- ═══════════════════════════════════════════════════════════════
--  PrimeShippExpress — Supabase Database Schema
--  HOW TO USE:
--  1. Go to supabase.com → your project → SQL Editor
--  2. Click "New query"
--  3. Copy ALL of this file and paste it in
--  4. Click "Run"
--  5. You should see "Success. No rows returned"
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ADMIN USERS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  username    VARCHAR(50) UNIQUE NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,        -- bcrypt hashed, NEVER plain text
  role        VARCHAR(50) NOT NULL DEFAULT 'dispatcher',
  full_name   VARCHAR(100),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SHIPMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_id     VARCHAR(20)  UNIQUE NOT NULL,
  customer_name   VARCHAR(100) NOT NULL,
  customer_email  VARCHAR(255) DEFAULT '',
  customer_phone  VARCHAR(50)  DEFAULT '',
  origin          VARCHAR(150) NOT NULL,
  destination     VARCHAR(150) NOT NULL,
  service_type    VARCHAR(50)  NOT NULL DEFAULT 'Air Freight',
  weight          VARCHAR(30)  DEFAULT '',
  status          VARCHAR(30)  NOT NULL DEFAULT 'pending',
  progress        INTEGER      NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  eta             DATE,
  priority        VARCHAR(20)  NOT NULL DEFAULT 'medium',
  notes           TEXT         DEFAULT '',
  current_lat     DECIMAL(10,6) DEFAULT 0,
  current_lng     DECIMAL(10,6) DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CHECKPOINTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkpoints (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id    UUID        NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  lat            DECIMAL(10,6) DEFAULT 0,
  lng            DECIMAL(10,6) DEFAULT 0,
  scheduled_time TIMESTAMPTZ,
  is_done        BOOLEAN     NOT NULL DEFAULT false,
  note           TEXT        DEFAULT '',
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  arrived_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LOCATION HISTORY ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_history (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id  UUID        NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  lat          DECIMAL(10,6) NOT NULL,
  lng          DECIMAL(10,6) NOT NULL,
  label        VARCHAR(150) DEFAULT '',
  note         TEXT         DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ship_tracking  ON shipments(tracking_id);
CREATE INDEX IF NOT EXISTS idx_ship_status    ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_ship_email     ON shipments(customer_email);
CREATE INDEX IF NOT EXISTS idx_cp_ship        ON checkpoints(shipment_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_loc_ship       ON location_history(shipment_id, created_at DESC);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipments_updated ON shipments;
CREATE TRIGGER trg_shipments_updated
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_admin_updated ON admin_users;
CREATE TRIGGER trg_admin_updated
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── DEFAULT ADMIN USER ────────────────────────────────────────────────────────
-- Username: admin
-- Password: primeshipp2026
-- ⚠️  CHANGE THIS PASSWORD immediately after your first login!
INSERT INTO admin_users (username, email, password, role, full_name)
VALUES (
  'admin',
  'admin@primeshippexpress.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCkrNT4rz8qwVPvO4Kz1Yx2',
  'super_admin',
  'System Administrator'
) ON CONFLICT (username) DO NOTHING;

-- ── SAMPLE SHIPMENTS ──────────────────────────────────────────────────────────
INSERT INTO shipments (
  tracking_id, customer_name, customer_email, customer_phone,
  origin, destination, service_type, weight,
  status, progress, eta, priority, current_lat, current_lng, notes
) VALUES
  ('PSE-2026-0001','Apex Global Corp','ops@apexglobal.com','+1 212 555 0101',
   'New York, USA','London, UK','Air Freight','320 kg',
   'in_transit',65,'2026-03-18','high',55.0,-30.0,'Fragile cargo'),

  ('PSE-2026-0002','Pacific Trade Ltd','shipping@pacifictrade.com','+86 21 555 0202',
   'Shanghai, China','Los Angeles, USA','Sea Freight','1400 kg',
   'customs',85,'2026-03-12','medium',33.9,-118.3,'Container #TCNU3456789'),

  ('PSE-2026-0003','East Africa Ventures','logistics@eaventures.co.ke','+254 20 555 0303',
   'Dubai, UAE','Nairobi, Kenya','Air Freight','210 kg',
   'delivered',100,'2026-03-08','low',-1.3,36.9,'POD received from John Kamau'),

  ('PSE-2026-0004','Euro-Latam Holdings','freight@eurolatam.de','+49 30 555 0404',
   'Berlin, Germany','São Paulo, Brazil','Air Freight','560 kg',
   'in_transit',40,'2026-03-20','high',20.0,-15.0,'Keep below 15°C'),

  ('PSE-2026-0005','AsiaPac Freight Co','ops@asiapac.sg','+65 6555 0505',
   'Singapore','Sydney, Australia','Sea Freight','880 kg',
   'in_transit',72,'2026-03-11','medium',-20.0,140.0,'Standard cargo')
ON CONFLICT (tracking_id) DO NOTHING;

-- ── SAMPLE CHECKPOINTS ────────────────────────────────────────────────────────
DO $$
DECLARE
  s1 UUID; s2 UUID; s3 UUID; s4 UUID; s5 UUID;
BEGIN
  SELECT id INTO s1 FROM shipments WHERE tracking_id = 'PSE-2026-0001';
  SELECT id INTO s2 FROM shipments WHERE tracking_id = 'PSE-2026-0002';
  SELECT id INTO s3 FROM shipments WHERE tracking_id = 'PSE-2026-0003';
  SELECT id INTO s4 FROM shipments WHERE tracking_id = 'PSE-2026-0004';
  SELECT id INTO s5 FROM shipments WHERE tracking_id = 'PSE-2026-0005';

  -- PSE-2026-0001 checkpoints
  IF s1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM checkpoints WHERE shipment_id = s1) THEN
    INSERT INTO checkpoints (shipment_id,name,lat,lng,is_done,note,sort_order) VALUES
      (s1,'New York (JFK)',40.64,-73.78,true,'Departed on schedule',0),
      (s1,'Boston Hub',42.36,-71.06,true,'Cleared customs',1),
      (s1,'Reykjavik',64.14,-21.90,true,'In transit',2),
      (s1,'Dublin Sort',53.35,-6.26,false,'',3),
      (s1,'London (LHR)',51.47,-0.45,false,'',4);
  END IF;

  -- PSE-2026-0002 checkpoints
  IF s2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM checkpoints WHERE shipment_id = s2) THEN
    INSERT INTO checkpoints (shipment_id,name,lat,lng,is_done,note,sort_order) VALUES
      (s2,'Shanghai Port',31.23,121.47,true,'Loaded on vessel',0),
      (s2,'Pacific Ocean',35.00,165.00,true,'On schedule',1),
      (s2,'Hawaii Transit',21.31,-157.86,true,'Refuel stop',2),
      (s2,'LA Customs',33.94,-118.41,false,'',3),
      (s2,'LA Port',33.74,-118.26,false,'',4);
  END IF;

  -- PSE-2026-0003 checkpoints
  IF s3 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM checkpoints WHERE shipment_id = s3) THEN
    INSERT INTO checkpoints (shipment_id,name,lat,lng,is_done,note,sort_order) VALUES
      (s3,'Dubai (DXB)',25.25,55.37,true,'Departed',0),
      (s3,'Muscat Transit',23.59,58.41,true,'',1),
      (s3,'Mogadishu Air',2.01,45.30,true,'',2),
      (s3,'Nairobi (NBO)',-1.32,36.93,true,'Delivered & signed',3);
  END IF;

  -- PSE-2026-0004 checkpoints
  IF s4 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM checkpoints WHERE shipment_id = s4) THEN
    INSERT INTO checkpoints (shipment_id,name,lat,lng,is_done,note,sort_order) VALUES
      (s4,'Berlin (BER)',52.37,13.50,true,'On time',0),
      (s4,'Lisbon Hub',38.78,-9.14,true,'Transfer done',1),
      (s4,'Atlantic',10.00,-25.00,false,'',2),
      (s4,'Recife Sort',-8.05,-34.88,false,'',3),
      (s4,'São Paulo (GRU)',-23.44,-46.47,false,'',4);
  END IF;

  -- PSE-2026-0005 checkpoints
  IF s5 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM checkpoints WHERE shipment_id = s5) THEN
    INSERT INTO checkpoints (shipment_id,name,lat,lng,is_done,note,sort_order) VALUES
      (s5,'Singapore Port',1.35,103.82,true,'Loaded',0),
      (s5,'Jakarta Hub',-6.21,106.85,true,'',1),
      (s5,'Darwin Transit',-12.46,130.84,true,'On track',2),
      (s5,'Brisbane Sort',-27.47,153.02,false,'',3),
      (s5,'Sydney Port',-33.87,151.21,false,'',4);
  END IF;
END $$;

-- ── SAMPLE LOCATION HISTORY ───────────────────────────────────────────────────
DO $$
DECLARE s1 UUID;
BEGIN
  SELECT id INTO s1 FROM shipments WHERE tracking_id = 'PSE-2026-0001';
  IF s1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM location_history WHERE shipment_id = s1) THEN
    INSERT INTO location_history (shipment_id,lat,lng,label,note) VALUES
      (s1,40.64,-73.78,'New York (JFK)','Departed'),
      (s1,42.36,-71.06,'Boston Hub','Cleared'),
      (s1,64.14,-21.90,'Reykjavik','Transit'),
      (s1,55.0,-30.0,'Mid-Atlantic','En route');
  END IF;
END $$;

-- ── VERIFY SETUP ─────────────────────────────────────────────────────────────
SELECT 'admin_users'     AS table_name, COUNT(*) AS rows FROM admin_users
UNION ALL
SELECT 'shipments',        COUNT(*) FROM shipments
UNION ALL
SELECT 'checkpoints',      COUNT(*) FROM checkpoints
UNION ALL
SELECT 'location_history', COUNT(*) FROM location_history;
