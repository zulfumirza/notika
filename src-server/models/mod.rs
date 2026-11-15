pub mod appearance;
pub mod frontmatter;
pub mod note;
pub mod settings;
pub mod share;
pub mod trash;

pub use appearance::{
    extract_first_emoji, is_emoji_string, normalize_note_color_id, normalize_note_icon_id,
    NoteAppearance, NoteColorId, NoteIconId, NOTE_COLOR_IDS, NOTE_ICON_IDS,
};
pub use frontmatter::{
    extract_note_appearance, extract_tags_from_markdown, is_frontmatter_pinned,
    patch_frontmatter_appearance, parse_frontmatter, replace_frontmatter_body,
    serialize_frontmatter_block, set_frontmatter_appearance, set_frontmatter_pinned,
    update_frontmatter_properties, FrontmatterProperty, FrontmatterPropertyKind, FrontmatterValue,
    ParsedFrontmatter,
};
pub use note::{AuthStatusResponse, NoteDocument, NoteMeta, ProjectTreeItem, SearchResultItem};
pub use settings::{AppSettings, TemplateItem};
pub use share::{
    PublicSharedNote, ShareKind, SharePermission, ShareRecord, StoredShareRecord,
};
pub use trash::{ProjectAppearance, StoredTrashItem, TrashItem};
