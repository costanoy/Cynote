import 'package:flutter/material.dart';

// Interface icons: Material Symbols, outlined, one weight. Each has its own
// class so screens (and tests) can name the icon instead of the glyph.
// Size and color default to the surrounding IconTheme.

class _CyIcon extends StatelessWidget {
  final IconData icon;
  final double? size;
  final Color? color;
  const _CyIcon(this.icon, {super.key, this.size, this.color});

  @override
  Widget build(BuildContext context) => Icon(icon, size: size, color: color);
}

class SearchIcon extends _CyIcon {
  const SearchIcon({super.key, super.size, super.color}) : super(Icons.search_outlined);
}

class TrashIcon extends _CyIcon {
  const TrashIcon({super.key, super.size, super.color}) : super(Icons.delete_outlined);
}

class SettingsIcon extends _CyIcon {
  const SettingsIcon({super.key, super.size, super.color}) : super(Icons.settings_outlined);
}

class BackChevronIcon extends _CyIcon {
  const BackChevronIcon({super.key, super.size, super.color}) : super(Icons.arrow_back_outlined);
}

class PlusIcon extends _CyIcon {
  const PlusIcon({super.key, super.size, super.color}) : super(Icons.add_outlined);
}

class UndoIcon extends _CyIcon {
  const UndoIcon({super.key, super.size, super.color}) : super(Icons.undo_outlined);
}

class RedoIcon extends _CyIcon {
  const RedoIcon({super.key, super.size, super.color}) : super(Icons.redo_outlined);
}

class SortIcon extends _CyIcon {
  const SortIcon({super.key, super.size, super.color}) : super(Icons.sort_outlined);
}

class ChevronDownIcon extends _CyIcon {
  const ChevronDownIcon({super.key, super.size, super.color}) : super(Icons.expand_more_outlined);
}

class CheckIcon extends _CyIcon {
  const CheckIcon({super.key, super.size, super.color}) : super(Icons.check_outlined);
}

class ClearIcon extends _CyIcon {
  const ClearIcon({super.key, super.size, super.color}) : super(Icons.close_outlined);
}

class ComputerIcon extends _CyIcon {
  const ComputerIcon({super.key, super.size, super.color}) : super(Icons.computer_outlined);
}

class UpdateIcon extends _CyIcon {
  const UpdateIcon({super.key, super.size, super.color}) : super(Icons.system_update_outlined);
}

/// Opens the formatting sheet (lists, check boxes, date and time).
class FormatIcon extends _CyIcon {
  const FormatIcon({super.key, super.size, super.color}) : super(Icons.format_list_bulleted_outlined);
}

class BulletListIcon extends _CyIcon {
  const BulletListIcon({super.key, super.size, super.color}) : super(Icons.format_list_bulleted_outlined);
}

class NumberedListIcon extends _CyIcon {
  const NumberedListIcon({super.key, super.size, super.color}) : super(Icons.format_list_numbered_outlined);
}

class CheckBoxIcon extends _CyIcon {
  const CheckBoxIcon({super.key, super.size, super.color}) : super(Icons.check_box_outlined);
}

class DateTimeIcon extends _CyIcon {
  const DateTimeIcon({super.key, super.size, super.color}) : super(Icons.event_outlined);
}

/// Sync states, for the editor's status bar.
class SyncedIcon extends _CyIcon {
  const SyncedIcon({super.key, super.size, super.color}) : super(Icons.cloud_done_outlined);
}

class SyncingIcon extends _CyIcon {
  const SyncingIcon({super.key, super.size, super.color}) : super(Icons.cloud_sync_outlined);
}

class SyncOffIcon extends _CyIcon {
  const SyncOffIcon({super.key, super.size, super.color}) : super(Icons.cloud_off_outlined);
}

class SyncProblemIcon extends _CyIcon {
  const SyncProblemIcon({super.key, super.size, super.color}) : super(Icons.sync_problem_outlined);
}

class CopyIcon extends _CyIcon {
  const CopyIcon({super.key, super.size, super.color}) : super(Icons.content_copy_outlined);
}
