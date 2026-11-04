package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.etcd.io/bbolt"

	"github.com/ofterm/ofterm/internal/model"
)

var (
	bucketMeta     = []byte("meta")
	bucketSettings = []byte("settings")
	bucketCommands = []byte("commands")
	bucketAudit    = []byte("audit")

	schemaVersion = []byte("1")
)

type Store struct {
	db *bbolt.DB
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	db, err := bbolt.Open(path, 0o600, &bbolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	return s.db.Update(func(tx *bbolt.Tx) error {
		for _, b := range [][]byte{bucketMeta, bucketSettings, bucketCommands, bucketAudit} {
			if _, err := tx.CreateBucketIfNotExists(b); err != nil {
				return err
			}
		}
		meta := tx.Bucket(bucketMeta)
		if meta.Get([]byte("schema")) == nil {
			return meta.Put([]byte("schema"), schemaVersion)
		}
		return nil
	})
}

func key(uid, id string) []byte { return []byte(uid + "\x00" + id) }

func (s *Store) GetSettings(uid string) (model.Settings, error) {
	settings := model.DefaultSettings()
	err := s.db.View(func(tx *bbolt.Tx) error {
		raw := tx.Bucket(bucketSettings).Get([]byte(uid))
		if raw == nil {
			return nil
		}
		return json.Unmarshal(raw, &settings)
	})
	return settings, err
}

func (s *Store) SaveSettings(uid string, settings model.Settings) error {
	raw, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketSettings).Put([]byte(uid), raw)
	})
}

func (s *Store) ListCommands(uid string) ([]model.Command, error) {
	var out []model.Command
	err := s.db.View(func(tx *bbolt.Tx) error {
		c := tx.Bucket(bucketCommands).Cursor()
		prefix := []byte(uid + "\x00")
		for k, v := c.Seek(prefix); k != nil && strings.HasPrefix(string(k), string(prefix)); k, v = c.Next() {
			var cmd model.Command
			if json.Unmarshal(v, &cmd) == nil {
				out = append(out, cmd)
			}
		}
		return nil
	})
	if out == nil {
		out = []model.Command{}
	}
	return out, err
}

func (s *Store) SaveCommand(uid string, cmd model.Command) error {
	raw, err := json.Marshal(cmd)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketCommands).Put(key(uid, cmd.ID), raw)
	})
}

func (s *Store) DeleteCommand(uid, id string) error {
	return s.db.Update(func(tx *bbolt.Tx) error {
		return tx.Bucket(bucketCommands).Delete(key(uid, id))
	})
}

func (s *Store) Audit(uid, action, detail string) {
	_ = s.db.Update(func(tx *bbolt.Tx) error {
		entry := fmt.Sprintf("%d\t%s\t%s\t%s", time.Now().Unix(), uid, action, detail)
		return tx.Bucket(bucketAudit).Put([]byte(time.Now().Format(time.RFC3339Nano)), []byte(entry))
	})
}
