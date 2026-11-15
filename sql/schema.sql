CREATE DATABASE IF NOT EXISTS item_purchase_management
  CHARACTER SET utf8mb4;

USE item_purchase_management;

CREATE TABLE IF NOT EXISTS item_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_types_type_name (type_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  purchase_date DATE NOT NULL,
  stock_available INT UNSIGNED NOT NULL DEFAULT 0,
  item_type_id INT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_type (item_type_id),
  KEY idx_items_active (active),
  CONSTRAINT fk_items_item_type
    FOREIGN KEY (item_type_id) REFERENCES item_types (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_items_stock_nonnegative CHECK (stock_available >= 0),
  CONSTRAINT chk_items_active_boolean CHECK (active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchases (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(40) NOT NULL,
  purchase_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchases_order_id (order_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_id INT UNSIGNED NOT NULL,
  item_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_items_purchase_item (purchase_id, item_id),
  KEY idx_purchase_items_item (item_id),
  CONSTRAINT fk_purchase_items_purchase
    FOREIGN KEY (purchase_id) REFERENCES purchases (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_items_item
    FOREIGN KEY (item_id) REFERENCES items (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_purchase_items_quantity_positive CHECK (quantity > 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO item_types (type_name) VALUES
  ('Electronics'),
  ('Furniture'),
  ('Clothing'),
  ('Grocery'),
  ('Stationery');
