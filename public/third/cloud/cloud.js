(function($){
    $.fn.cloud = function(options) {
        var options = $.extend({
            data: [],
            cloud_id: "svg_cloud",
            font_factor: .8,
            min_font_size : 13,
            max_font_size: 50,
            min_color: "#ddd",
            max_color: "#00a1f4",
            onclick: function(d){
                return console.log(d.text);
            }
        }, options);
        var make = function() {
            var el = $(this), vis = null, containerid, cloudid, width, height, min_size, max_size, word_scale, word_color;
            init();
            create_vis();
            start();
            init_resize();
            function init(){
                containerid = "#" + el.attr("id");
                cloudid = "#" + options.cloud_id;
                width = el.width();
                height = el.height();
                min_size = d3.min(options.data, function(d) { return parseInt(d.count); });
                max_size = d3.max(options.data, function(d) { return parseInt(d.count); });
                word_scale = d3.scaleLinear().domain([min_size, max_size]).range([options.min_font_size/options.font_factor, options.max_font_size/options.font_factor]).clamp(true);
                word_color = d3.scaleLinear().domain([options.min_font_size, options.max_font_size]).range([options.min_color, options.max_color]);
            };
            function create_vis(){
                vis = d3.select(containerid).append("svg").attr("width", width).attr("height", height).attr("id", options.cloud_id);
            };
            function resize_vis(){
                width = el.width();
                height = el.height();
                el.empty();
                create_vis();
                start();
            };
            function init_resize(){
                var m_timer = null;
                $(window).resize(function(){ onWindowResize(); });
                function onWindowResize() {
                    if (m_timer == null) {
                        m_timer = window.setTimeout(function () {
                            resize_vis();
                            window.clearTimeout(m_timer);
                            m_timer = null;
                        }, 100);
                    }
                }
            };
            function start(){
                d3.layout.cloud().size([width, height])
                    .words(options.data)
                    .rotate(function() { return ~~(Math.random() * 2) * 0; })
                    .fontSize(function(d) { return word_scale(d.count); })
                    .on("end", draw)
                    .start();
            };
            function draw(words){
                vis.append("g")
                    .attr("transform", "translate(" + (width/2) + "," + (height/2 + 5) + ")")
                    .selectAll("text")
                    .data(words)
                    .enter().append("text")
                    .style("font-family", "segoe ui")
                    .style("font-size", function(d) { return (d.size * options.font_factor) + "px"; })
                    .style("fill", function(d) { return word_color(d.size); })
                    .attr("text-anchor", "middle")
                    .attr("transform", function(d) { return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")"; })
                    .text(function(d) { return d.text; })
                    .on("mouseover", function(d, i){ return mouse_over(this); })
                    .on("mouseout", function(d, i){ return mouse_out(this); })
                    .on("click", function(d, i){ return options.onclick(d); });
            };
            function mouse_over(element){
                return d3.select(element)
                    .style("text-decoration", "underline")
                    .style("cursor", "pointer");
            };
            function mouse_out(element){
                return d3.select(element)
                    .style("text-decoration", "none");
            };
        };
        return this.each(make);
    };
})(jQuery);