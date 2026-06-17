"""
Models — 内部获取 Store / FileStore 实例的快捷方式。

各 Tool 内部使用::

    from pipeline.Tools.Models import _get_store
    store = _get_store()
"""

from .. import _get_store, _get_filestore, _get_session_manager
