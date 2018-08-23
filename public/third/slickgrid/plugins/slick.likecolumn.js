
(function ($) {
    // register namespace
    $.extend(true, window, {
        "Slick": {
            "LikeColumn": LikeColumn
        }
    });


    function LikeColumn(options) {
        var _grid;
        var _self = this;
        var _defaults = {
            columnId: "_like_selector",
            cssClass: null,
            toolTip: "",
            width: 100
        };

        var _options = $.extend(true, {}, _defaults, options);

        function init(grid) {
            _grid = grid;
        }

        function destroy() {
        }

        function getColumnDefinition() {
            return {
                id: _options.columnId,
                name: "",
                toolTip: _options.toolTip,
                field: "LikeCount",
                width: _options.width,
                resizable: false,
                sortable: false,
                cssClass: _options.cssClass,
                formatter: likeFormatter
            };
        }

        function likeFormatter(row, cell, value, columnDef, dataContext) {
            if (dataContext) {
                var likeRate = "";
                if (dataContext && dataContext.likeRate)
                    likeRate = dataContext.likeRate;
                return '<div class="like" style="visibility:hidden"><div class="btn-group"><button id="btn-like" class="btn btn-mini btn-success"><img src="/asyst/img/thumb-up.png"></button><button class="btn btn-mini disabled"><span id="like-rate">' + likeRate + '</span></button><button id="btn-unlike" class="btn btn-mini btn-danger"><img src="/asyst/img/thumb-down.png"></button></div></div>';
            }
            return null;
        }

        $(document).on("click", "#btn-like", function (event) {
            var $row = $(this).parents(".slick-row");
            var grid = $("#view").data('slickgrid');
            var row = $row.attr("row");
            var $cnt = $row.find('#like-rate');
            var idx = parseInt(row);
            var item = grid.getDataItem(idx);

            Asyst.protocol.send("/asyst/Handlers/SocialLikeHandler.ashx", "POST", { ActionType: 'like', EntityId: grid.EntityId, Id: item[grid.KeyName] }, true,
                                function (data) {
                                    if (data && isFinite(data.count)) {
                                        item.likeRate = data.count;
                                        $cnt.html(data.count);
                                        grid.invalidateRow(idx);
                                        grid.render();
                                    }
                                },
                                function (error) { }, this);
            event.preventDefault();
            event.stopImmediatePropagation();
        });

        $(document).on("click", '#btn-unlike', function (event) {
            var $row = $(this).parents(".slick-row");
            var grid = $("#view").data('slickgrid');
            var row = $row.attr("row");
            var $cnt = $row.find('#like-rate');
            var idx = parseInt(row);
            var item = grid.getDataItem(idx);

            Asyst.protocol.send("/asyst/Handlers/SocialLikeHandler.ashx", "POST", { ActionType: 'notlike', EntityId: grid.EntityId, Id: item[grid.KeyName] }, true,
                                function (data) {
                                    if (data && isFinite(data.count)) {
                                        item.likeRate = data.count;
                                        $cnt.html(data.count);
                                        grid.invalidateRow(idx);
                                        grid.render();
                                    }
                                },
                                function (error) { }, this);
            event.preventDefault();
            event.stopImmediatePropagation();
        });

        var hoverRow = 0;
        $(document).on("mouseover mouseout", ".slick-row", function (event) {
            var $row = $(this);
            var idx = parseInt($row.attr("row"));
            var $cnt = $row.find('#like-rate');

            var grid = $row.parents("#view").data('slickgrid');

            if (!grid || !grid.EntityId || !grid.KeyName)
                return;

            var item = grid.getDataItem(idx);

            if (event.type == 'mouseover') {
                hoverRow = idx;

                try {
                    $row.find(".like").css({ "visibility": "visible" });

                    if (!isFinite(item.likeRate)) {
                        delete item['like-timeout-id'];
                        Asyst.protocol.send("/asyst/Handlers/SocialLikeHandler.ashx", "GET", { EntityId: grid.EntityId, Id: item[grid.KeyName] }, true,
                            function (data) {
                                if (data && isFinite(data.count)) {
                                    item.likeRate = data.count;
                                    $cnt.html(data.count);
                                }
                            },
                            function (error) {
                                var e = error;
                            }, this);
                    }
                }
                catch (error) {
                    var dummy = 0;
                }
            }
            else {
                hoverRow = 0;
                $(this).find(".like").css({ "visibility": "hidden" });
            }

            event.preventDefault();
            event.stopImmediatePropagation();
        });

        $.extend(this, {
            "init": init,
            "destroy": destroy,

            "getColumnDefinition": getColumnDefinition
        });
    }
})(jQuery);