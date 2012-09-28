/*jslint browser: true, devel: true, sloppy: true,
    plusplus: true, nomen: true, regexp: true,
    white: true, undef: true */
/*global $: false, jQuery: false, Handlebars: false,
    zephyr_json: false, initial_pointer: false, email: false,
    class_list: false, instance_list: false, people_list: false,
    have_initial_messages: false */

var loading_spinner;
var templates = {};
$(function () {
    // Display loading indicator.  This disappears after the first
    // get_updates completes.
    if (have_initial_messages)
        loading_spinner = new Spinner().spin($('#loading_spinner')[0]);
    else
        $('#loading_indicator').hide();

    // Compile Handlebars templates.
    templates.zephyr       = Handlebars.compile($("#template_zephyr").html());
    templates.subscription = Handlebars.compile($("#template_subscription").html());
});

function register_huddle_onclick(zephyr_row, sender) {
    zephyr_row.find(".zephyr_sender").click(function (e) {
        prepare_huddle(sender);
        // The sender span is inside the messagebox, which also has an
        // onclick handler. We don't want to trigger the messagebox
        // handler.
        e.stopPropagation();
    });
}

function register_onclick(zephyr_row, zephyr_id) {
    zephyr_row.find(".messagebox").click(function (e) {
        if (!(clicking && mouse_moved)) {
            // Was a click (not a click-and-drag).
            select_zephyr_by_id(zephyr_id);
            respond_to_zephyr();
        }
        mouse_moved = false;
        clicking = false;
    });
}

var zephyr_array = [];
var zephyr_dict = {};
var instance_list = [];
var status_classes = 'alert-error alert-success alert-info';

function report_error(response, xhr, status_box) {
    if (xhr.status.toString().charAt(0) === "4") {
        // Only display the error response for 4XX, where we've crafted
        // a nice response.
        response += ": " + $.parseJSON(xhr.responseText).msg;
    }

    status_box.removeClass(status_classes).addClass('alert-error')
              .text(response).stop(true).fadeTo(0, 1);
}

$(function () {
    $('#zephyr-type-tabs a[href="#class-message"]').on('shown', function (e) {
        $('#class-message input:not(:hidden):first').focus().select();
    });
    $('#zephyr-type-tabs a[href="#personal-message"]').on('shown', function (e) {
        $('#personal-message input:not(:hidden):first').focus().select();
    });

    // Prepare the click handler for subbing to a new class to which
    // you have composed a zephyr.
    $('#create-it').click(function () {
        sub(compose_class_name());
        $("#class-message form").ajaxSubmit();
        $('#class-dne').stop(true).fadeOut(500);
    });

    // Prepare the click handler for subbing to an existing class.
    $('#sub-it').click(function () {
        sub(compose_class_name());
        $("#class-message form").ajaxSubmit();
        $('#class-nosub').stop(true).fadeOut(500);
    });

    $('#sidebar a[href="#subscriptions"]').click(function () {
        $.ajax({
            type:     'GET',
            url:      'json/subscriptions/list',
            dataType: 'json',
            timeout:  10*1000,
            success: function (data) {
                $('#subscriptions_table tr').remove();
                if (data) {
                    $.each(data.subscriptions, function (index, name) {
                        $('#subscriptions_table').append(templates.subscription({subscription: name}));
                    });
                }
                $('#new_subscriptions').focus().select();
                $("#subscriptions-status").fadeOut(0);
            },
            error: function (xhr) {
                report_error("Error listing subscriptions", xhr, $("#subscriptions-status"));
            },
        });
    });

    var last_mousewheel = 0;
    $("#main_div").mousewheel(function () {
        var time = $.now();
        if (time - last_mousewheel > 50) {
            keep_pointer_in_view();
            last_mousewheel = time;
        }
    });
});

$.ajaxSetup({
    beforeSend: function (xhr, settings) {
        function getCookie(name) {
            var i, cookies, cookieValue = null;
            if (document.cookie && document.cookie !== '') {
                cookies = document.cookie.split(';');
                for (i = 0; i < cookies.length; i++) {
                    var cookie = jQuery.trim(cookies[i]);
                    // Does this cookie string begin with the name we want?
                    if (cookie.substring(0, name.length + 1) === (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }
        if (!(/^http:.*/.test(settings.url) || /^https:.*/.test(settings.url))) {
            // Only send the token to relative URLs i.e. locally.
            xhr.setRequestHeader("X-CSRFToken", getCookie('csrftoken'));
        }
    }
});

function sub(zephyr_class) {
    // TODO: check the return value and handle an error condition
    $.post('/json/subscriptions/add', {new_subscription: zephyr_class});
}

function compose_button() {
    clear_compose_box();
    $('#sidebar a[href="#home"]').tab('show');
    show_compose('class', $("#class"));
}

function hide_compose() {
    $('input, textarea, button').blur();
    $('.zephyr_compose').slideUp(100);
}

function show_compose(tabname, focus_area) {
    $('.zephyr_compose').slideDown(100);
    $('#zephyr-type-tabs a[href="#' + tabname + '-message"]').tab('show');
    focus_area.focus();
    focus_area.select();
}

function toggle_compose() {
    if ($("#zephyr-type-tabs li.active").find("a[href=#class-message]").length !== 0) {
        // In class tab, switch to personals.
        show_compose('personal', $("#recipient"));
    } else {
        show_compose('class', $("#class"));
    }
}

function compose_class_name() {
    return $.trim($("#class").val());
}

$(function () {
    var send_status = $('#send-status');
    var buttons = $('#class-message, #personal-message').find('input[type="submit"]');

    var options = {
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        beforeSubmit: function (form, _options) {
            send_status.removeClass(status_classes)
                       .addClass('alert-info')
                       .text('Sending')
                       .stop(true).fadeTo(0,1);
            buttons.attr('disabled', 'disabled');
            buttons.blur();

            if ($("#class-message:visible")[0] === undefined) {// we're not dealing with classes
                return true;
            }

            var zephyr_class = compose_class_name();
            if (zephyr_class === "") {
                // You can't try to send to an empty class.
                send_status.removeClass(status_classes)
                           .addClass('alert-error')
                           .text('Please specify a class')
                           .stop(true).fadeTo(0,1);
                buttons.removeAttr('disabled');
                $('#class-message input:not(:hidden):first').focus().select();
                return false;
            }

            var okay = true;
            $.ajax({
                url: "subscriptions/exists/" + zephyr_class,
                async: false,
                success: function (data) {
                    if (data === "False") {
                        // The class doesn't exist
                        okay = false;
                        send_status.removeClass(status_classes);
                        send_status.toggle();
                        $('#class-dne-name').text(zephyr_class);
                        $('#class-dne').show();
                        $('#create-it').focus();
                        buttons.removeAttr('disabled');
                        hide_compose();
                    }
                }
            });
            if (okay && class_list.indexOf(zephyr_class) === -1) {
                // You're not subbed to the class
                okay = false;
                send_status.removeClass(status_classes);
                send_status.toggle();
                $('#class-nosub-name').text(zephyr_class);
                $('#class-nosub').show();
                $('#sub-it').focus();
                buttons.removeAttr('disabled');
                hide_compose();
            }
            return okay;
        },
        success: function (resp, statusText, xhr, form) {
            form.find('textarea').val('');
            send_status.removeClass(status_classes)
                       .addClass('alert-success')
                       .text('Sent message')
                       .stop(true).fadeTo(0,1).delay(250).fadeOut(250, hide_compose);
            buttons.removeAttr('disabled');
        },
        error: function (xhr) {
            var response = "Error sending message";
            if (xhr.status.toString().charAt(0) === "4") {
                // Only display the error response for 4XX, where we've crafted
                // a nice response.
                response += ": " + $.parseJSON(xhr.responseText).msg;
            }
            send_status.removeClass(status_classes)
                       .addClass('alert-error')
                       .text(response)
                       .append($('<span />')
                           .addClass('send-status-close').html('&times;')
                           .click(function () { send_status.stop(true).fadeOut(500); }))
                       .stop(true).fadeTo(0,1);

            buttons.removeAttr('disabled');
        }
    };

    send_status.hide();
    $("#class-message form").ajaxForm(options);
    $("#personal-message form").ajaxForm(options);
});

$(function () {
    var options = {
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        success: function (resp, statusText, xhr, form) {
            var name = $.parseJSON(xhr.responseText).data;
            $('#subscriptions_table').find('button[value="' + name + '"]').parents('tr').remove();
            var removal_index = class_list.indexOf(name);
            if (removal_index !== -1) {
                class_list.splice(removal_index, 1);
            }
            update_autocomplete();
            $("#subscriptions-status").fadeOut(0);
        },
        error: function (xhr) {
            report_error("Error removing subscription", xhr, $("#subscriptions-status"));
        },
    };
    $("#current_subscriptions").ajaxForm(options);
});

$(function () {
    var options = {
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        success: function (resp, statusText, xhr, form) {
            $("#new_subscription").val("");
            var name = $.parseJSON(xhr.responseText).data;
            $('#subscriptions_table').prepend(templates.subscription({subscription: name}));
            class_list.push(name);
            $("#subscriptions-status").fadeOut(0);
        },
        error: function (xhr) {
            report_error("Error adding subscription", xhr, $("#subscriptions-status"));
        },
    };
    $("#add_new_subscription").ajaxForm(options);
});

$(function () {
    var settings_status = $('#settings-status');
    settings_status.hide();
    var options = {
        dataType: 'json', // This seems to be ignored. We still get back an xhr.
        success: function (resp, statusText, xhr, form) {
            var message = "Updated settings!";
            var result = $.parseJSON(xhr.responseText);
            if ((result.full_name !== undefined) || (result.short_name !== undefined)) {
                message = "Updated settings!  You will need to reload the page for your changes to take effect.";
            }
            settings_status.removeClass(status_classes)
                .addClass('alert-success')
                .text(message).stop(true).fadeTo(0,1);
            // TODO: In theory we should auto-reload or something if
            // you changed the email address or other fields that show
            // up on all screens
        },
        error: function (xhr, error_type, xhn) {
            var response = "Error changing settings";
            if (xhr.status.toString().charAt(0) === "4") {
                // Only display the error response for 4XX, where we've crafted
                // a nice response.
                response += ": " + $.parseJSON(xhr.responseText).msg;
            }
            settings_status.removeClass(status_classes)
                .addClass('alert-error')
                .text(response).stop(true).fadeTo(0,1);
        },
    };
    $("#current_settings form").ajaxForm(options);
});

var selected_zephyr_id = -1;  /* to be filled in on document.ready */
var selected_zephyr;  // = get_zephyr_row(selected_zephyr_id)
var last_received = -1;

// Narrowing predicate, or 'false' for the home view.
var narrowed = false;

// For tracking where you were before you narrowed.
var persistent_zephyr_id = 0;
var high_water_mark = 0;

function get_all_zephyr_rows() {
    return $('tr.zephyr_row');
}

function get_next_visible(zephyr_row) {
    if (zephyr_row === undefined)
        return [];
    return zephyr_row.nextAll('.zephyr_row:first');
}

function get_prev_visible(zephyr_row) {
    if (zephyr_row === undefined)
        return [];
    return zephyr_row.prevAll('.zephyr_row:first');
}

function get_first_visible() {
    return $('.focused_table .zephyr_row:first');
}

function get_last_visible() {
    return $('.focused_table .zephyr_row:last');
}

function get_id(zephyr_row) {
    return zephyr_row.attr('zid');
}

function get_zephyr_row(zephyr_id) {
    return $('#' + (narrowed ? 'zfilt' : 'zhome') + zephyr_id);
}

function scroll_to_selected() {
    var main_div = $('#main_div');
    main_div.scrollTop(0);
    main_div.scrollTop(selected_zephyr.offset().top - main_div.height()/1.5);
}

function get_huddle_recipient(zephyr) {
    var recipient, i;

    recipient = zephyr.display_recipient[0].email;
    for (i = 1; i < zephyr.display_recipient.length; i++) {
        recipient += ', ' + zephyr.display_recipient[i].email;
    }
    return recipient;
}

function get_huddle_recipient_names(zephyr) {
    var recipient, i;

    recipient = zephyr.display_recipient[0].name;
    for (i = 1; i < zephyr.display_recipient.length; i++) {
        recipient += ', ' + zephyr.display_recipient[i].name;
    }
    return recipient;
}

function respond_to_zephyr() {
    var zephyr, recipient, recipients;
    zephyr = zephyr_dict[selected_zephyr_id];

    switch (zephyr.type) {
    case 'class':
        $('#zephyr-type-tabs a[href="#class-message"]').tab('show');
        $("#class").val(zephyr.display_recipient);
        $("#instance").val(zephyr.instance);
        show_compose('class', $("#new_zephyr"));
        break;

    case 'huddle':
        $('#zephyr-type-tabs a[href="#personal-message"]').tab('show');
        prepare_huddle(zephyr.reply_to);
        break;

    case 'personal':
        // Until we allow sending zephyrs based on multiple meaningful
        // representations of a user (name, username, email, etc.), just
        // deal with emails.
        recipient = zephyr.display_recipient;
        if (recipient === email) { // that is, we sent the original message
            recipient = zephyr.sender_email;
        }
        prepare_huddle(recipient);
        break;
    }
}

// Called by mouseover etc.
function select_zephyr_by_id(zephyr_id) {
    if (zephyr_id === selected_zephyr_id) {
        return;
    }
    select_zephyr(get_zephyr_row(zephyr_id), false);
}

var clicking = false;
var mouse_moved = false;

function zephyr_mousedown() {
    mouse_moved = false;
    clicking = true;
}

function zephyr_mousemove() {
    if (clicking) {
        mouse_moved = true;
    }
}

// Called on page load and when we [un]narrow.
// Forces a call to select_zephyr even if the id has not changed,
// because the visible table might have.
function select_and_show_by_id(zephyr_id) {
    select_zephyr(get_zephyr_row(zephyr_id), true);
}

function update_selected_zephyr(zephyr) {
    $('.selected_zephyr').removeClass('selected_zephyr');
    zephyr.addClass('selected_zephyr');

    var new_selected_id = get_id(zephyr);
    if (!narrowed && new_selected_id !== selected_zephyr_id) {
        // Narrowing is a temporary view on top of the home view and
        // doesn't permanently affect where you are.
        //
        // We also don't want to post if there's no effective change.
        $.post("update", {pointer: new_selected_id});
    }
    selected_zephyr_id = new_selected_id;
    selected_zephyr = zephyr;

    if (parseInt(selected_zephyr_id, 10) > high_water_mark) {
        high_water_mark = parseInt(selected_zephyr_id, 10);
    }

}

function select_zephyr(next_zephyr, scroll_to) {
    var main_div = $("#main_div");

    /* If the zephyr exists but is hidden, try to find the next visible one. */
    if (next_zephyr.length !== 0 && next_zephyr.is(':hidden')) {
        next_zephyr = get_next_visible(next_zephyr);
    }

    /* Fall back to the first visible zephyr. */
    if (next_zephyr.length === 0) {
        next_zephyr = $('tr:not(:hidden):first');
    }
    if (next_zephyr.length === 0) {
        // There are no zephyrs!
        return false;
    }

    update_selected_zephyr(next_zephyr);

    if (scroll_to &&
        ((next_zephyr.offset().top < main_div.offset().top) ||
         (next_zephyr.offset().top + next_zephyr.height() >
             main_div.offset().top + main_div.height()))) {
        scroll_to_selected();
    }
}

function go_to_high_water_mark() {
    select_and_show_by_id(high_water_mark);
}

/* We use 'visibility' rather than 'display' and jQuery's show() / hide(),
   because we want to reserve space for the email address.  This avoids
   things jumping around slightly when the email address is shown. */

function hide_email() {
    $('.zephyr_sender_email').addClass('invisible');
}

function show_email(zephyr_id) {
    hide_email();
    get_zephyr_row(zephyr_id).find('.zephyr_sender_email').removeClass('invisible');
}

// NB: This just binds to current elements, and won't bind to elements
// created after ready() is called.

$(function () {
    $('input, textarea, button').focus(function () {
        keydown_handler = process_key_in_input;
    });
    $('input, textarea, button').blur(function () {
        keydown_handler = process_hotkey;
    });
});

function prepare_huddle(recipients) {
    // Used for both personals and huddles.
    show_compose('personal', $("#new_personal_zephyr"));
    $("#recipient").val(recipients);
}

function do_narrow(description, filter_function) {
    narrowed = filter_function;

    // Your pointer isn't changed when narrowed.
    persistent_zephyr_id = selected_zephyr_id;

    // We want the zephyr on which the narrow happened to stay in the same place if possible.
    var old_top = $("#main_div").offset().top - selected_zephyr.offset().top;
    var parent;

    // Empty the filtered table right before we fill it again
    $("#zfilt").empty();
    add_to_table(zephyr_array, 'zfilt', filter_function);

    // Show the new set of messages.
    $("#zfilt").addClass("focused_table");

    $("#show_all_messages").removeAttr("disabled");
    $("#narrowbox").show();
    $("#main_div").addClass("narrowed_view");
    $("#currently_narrowed_to").html(description);
    $("#zhome").removeClass("focused_table");

    select_and_show_by_id(selected_zephyr_id);
    scroll_to_selected();
}

function narrow_huddle() {
    var original = zephyr_dict[selected_zephyr_id];
    do_narrow("Group chats with " + original.reply_to, function (other) {
        return other.reply_to === original.reply_to;
    });
}

function narrow_all_personals() {
    do_narrow("All huddles with you", function (other) {
        return other.type === "personal" || other.type === "huddle";
    });
}

function narrow_personals() {
    // Narrow to personals with a specific user
    var original = zephyr_dict[selected_zephyr_id];
    var other_party;
    if (original.display_recipient === email) {
        other_party = original.sender_email;
    } else {
        other_party = original.display_recipient;
    }

    do_narrow("Huddles with " + other_party, function (other) {
        return (other.type === 'personal') &&
            (((other.display_recipient === original.display_recipient) && (other.sender_email === original.sender_email)) ||
             ((other.display_recipient === original.sender_email) && (other.sender_email === original.display_recipient)));
    });

}

function narrow_class() {
    var original = zephyr_dict[selected_zephyr_id];
    var message = "<span class='narrowed_name'>" + original.display_recipient + "</span>";
    do_narrow(message, function (other) {
        return (other.type === 'class' &&
                original.recipient_id === other.recipient_id);
    });
}

function narrow_instance() {
    var original = zephyr_dict[selected_zephyr_id];
    if (original.type !== 'class')
        return;

    var message = "<span class='narrowed_name'>" + original.display_recipient
        + " | " + original.instance + "</span>";
    do_narrow(message, function (other) {
        return (other.type === 'class' &&
                original.recipient_id === other.recipient_id &&
                original.instance === other.instance);
    });
}

// Called for the 'narrow by class' hotkey.
function narrow_by_recipient() {
    switch (zephyr_dict[selected_zephyr_id].type) {
        case 'personal': narrow_personals(); break;
        case 'huddle':   narrow_huddle();    break;
        case 'class':    narrow_class();     break;
    }
}

function show_all_messages() {
    if (!narrowed) {
        return;
    }
    narrowed = false;

    $("#zfilt").removeClass('focused_table');
    $("#zhome").addClass('focused_table');
    $("#narrowbox").hide();
    $("#main_div").removeClass('narrowed_view');
    $("#show_all_messages").attr("disabled", "disabled");
    $("#currently_narrowed_to").html("");

    // Includes scrolling.
    select_and_show_by_id(persistent_zephyr_id);

    scroll_to_selected();
}

var autocomplete_needs_update = false;

function update_autocomplete() {
    class_list.sort();
    instance_list.sort();
    people_list.sort();

    // limit number of items so the list doesn't fall off the screen
    $( "#class" ).typeahead({
        source: class_list,
        items: 3,
    });
    $( "#instance" ).typeahead({
        source: instance_list,
        items: 2,
    });
    $( "#recipient" ).typeahead({
        source: people_list,
        items: 4,
    });

    autocomplete_needs_update = false;
}

function same_recipient(a, b) {
    if ((a === undefined) || (b === undefined))
        return false;
    if (a.type !== b.type)
        return false;

    switch (a.type) {
    case 'huddle':
        return a.recipient_id === b.recipient_id;
    case 'personal':
        return a.reply_to === b.reply_to;
    case 'class':
        return (a.recipient_id === b.recipient_id) &&
               (a.instance     === b.instance);
    }

    // should never get here
    return false;
}

function same_sender(a, b) {
    return ((a !== undefined) && (b !== undefined) &&
            (a.sender_email === b.sender_email));
}

function add_to_table(zephyrs, table_name, filter_function) {
    var table = $('#' + table_name);
    var prev = zephyr_dict[table.find('tr:last-child').attr('zid')];
    var zephyrs_to_render = [];
    var ids_where_next_is_same_sender = [];

    $.each(zephyrs, function (index, zephyr) {
        if (! filter_function(zephyr))
            return;

        zephyr.content = linkify(zephyr.content, {
            callback: function (text, href) {
                    return href ? '<a href="' + href + '" target="_blank" title="' +
                    href + '" onclick="event.cancelBubble = true;"">' + text + '</a>' : text;
                }
            });

        zephyr.include_recipient = false;
        zephyr.include_bookend   = false;
        if (! same_recipient(prev, zephyr)) {
            // Add a space to the table, but not for the first element.
            zephyr.include_recipient = true;
            zephyr.include_bookend   = (prev !== undefined);
        }

        zephyr.include_sender = true;
        if (same_sender(prev, zephyr) && !zephyr.include_recipient) {
            zephyr.include_sender = false;
            ids_where_next_is_same_sender.push(prev.id);
        }

        zephyr.dom_id = table_name + zephyr.id;

        zephyrs_to_render.push(zephyr);
        prev = zephyr;
    });

    table.append(templates.zephyr({'zephyrs': zephyrs_to_render}));

    $.each(zephyrs_to_render, function (index, zephyr) {
        var row = get_zephyr_row(zephyr.id);
        register_huddle_onclick(row, zephyr.sender_email);
        register_onclick(row, zephyr.id);
    });

    $.each(ids_where_next_is_same_sender, function (index, id) {
        get_zephyr_row(id).find('.messagebox').addClass("next_is_same_sender");
    });
}

function add_zephyr_metadata(dummy, zephyr) {
    last_received = Math.max(last_received, zephyr.id);

    switch (zephyr.type) {
    case 'class':
        zephyr.is_class = true;
        if ($.inArray(zephyr.display_recipient, class_list) === -1) {
            class_list.push(zephyr.display_recipient);
            autocomplete_needs_update = true;
        }
        if ($.inArray(zephyr.instance, instance_list) === -1) {
            instance_list.push(zephyr.instance);
            autocomplete_needs_update = true;
        }
        break;

    case 'huddle':
        zephyr.is_huddle = true;
        zephyr.reply_to = get_huddle_recipient(zephyr);
        zephyr.display_reply_to = get_huddle_recipient_names(zephyr);
        break;

    case 'personal':
        zephyr.is_personal = true;

        if (zephyr.display_recipient === email) { // that is, we sent the original message
            zephyr.reply_to = zephyr.sender_email;
        } else {
            zephyr.reply_to = zephyr.display_recipient;
        }
        zephyr.display_reply_to = zephyr.reply_to;

        if (zephyr.reply_to !== email &&
                $.inArray(zephyr.reply_to, people_list) === -1) {
            people_list.push(zephyr.reply_to);
            autocomplete_needs_update = true;
        }
        break;
    }

    var time = new Date(zephyr.timestamp * 1000);
    var two_digits = function (x) { return ('0' + x).slice(-2); };
    zephyr.timestr = two_digits(time.getHours())
                   + ':' + two_digits(time.getMinutes());
    zephyr.full_date_str = time.toLocaleString();

    zephyr_dict[zephyr.id] = zephyr;
}

function add_messages(zephyrs) {
    $.each(zephyrs, add_zephyr_metadata);

    if (loading_spinner) {
        loading_spinner.stop();
        $('#loading_indicator').hide();
        loading_spinner = undefined;
    }

    if (narrowed)
        add_to_table(zephyrs, 'zfilt', narrowed);

    // Even when narrowed, add messages to the home view so they exist when we un-narrow.
    add_to_table(zephyrs, 'zhome', function () { return true; });

    $.each(zephyrs, function () {
        zephyr_array.push(this);

        // If we received the initially selected message, select it on the client side,
        // but not if the user has already selected another one during load.
        if ((this.id === initial_pointer) && (selected_zephyr_id === -1)) {
            select_and_show_by_id(initial_pointer);
        }
    });

    if (autocomplete_needs_update)
        update_autocomplete();
}

function clear_compose_box() {
    $("#zephyr_compose").find('input[type=text], textarea').val('');
}

var get_updates_failures = 0;
function get_updates() {
    console.log(new Date() + ': longpoll started');
    $.ajax({
        type:     'POST',
        url:      'get_updates',
        data:     { last_received: last_received },
        dataType: 'json',
        timeout:  10*60*1000, // 10 minutes in ms
        success: function (data) {
            console.log(new Date() + ': longpoll success');
            get_updates_failures = 0;
            $('#connection-error').hide();

            if (data && data.zephyrs) {
                add_messages(data.zephyrs);
            }
            setTimeout(get_updates, 0);
        },
        error: function (xhr, error_type, exn) {
            if (error_type === 'timeout') {
                // Retry indefinitely on timeout.
                console.log(new Date() + ': longpoll timed out');
                get_updates_failures = 0;
                $('#connection-error').hide();
            } else {
                console.log(new Date() + ': longpoll failed with ' + error_type +
                            ' (' + get_updates_failures + ' failures)');
                get_updates_failures += 1;
            }

            if (get_updates_failures >= 5) {
                $('#connection-error').show();
            } else {
                $('#connection-error').hide();
            }

            var retry_sec = Math.min(90, Math.exp(get_updates_failures/2));
            console.log(new Date() + ': longpoll retrying in ' + retry_sec + ' seconds');
            setTimeout(get_updates, retry_sec*1000);
        }
    });
}

$(function () {
    get_updates();
    $('.button-slide').click(function () {
        show_compose('class', $("#class"));
    });
});

function above_view(zephyr) {
    return zephyr.offset().top < $("#main_div").offset().top;
}

function below_view(zephyr) {
    var main_div = $("#main_div");
    return zephyr.offset().top + zephyr.height() > main_div.offset().top + main_div.height();
}

function keep_pointer_in_view() {
    var main_div = $("#main_div");
    var next_zephyr = get_zephyr_row(selected_zephyr_id);

    if (above_view(next_zephyr)) {
        while (above_view(next_zephyr)) {
            next_zephyr = get_next_visible(next_zephyr);
        }
    } else if (below_view(next_zephyr)) {
        while (below_view(next_zephyr)) {
            next_zephyr = get_prev_visible(next_zephyr);
        }
    }

    if ((main_div.scrollTop() === 0) && (next_zephyr.attr("zid") > get_first_visible().attr("zid"))) {
        // If we've scrolled to the top, keep inching the selected
        // zephyr up to the top instead of just the latest one that is
        // still on the screen.
        next_zephyr = get_prev_visible(next_zephyr);
    } else if ((main_div.scrollTop() + main_div.innerHeight() >= main_div[0].scrollHeight) &&
               (next_zephyr.attr("zid") < get_last_visible().attr("zid"))) {
        next_zephyr = get_next_visible(next_zephyr);
    }
    update_selected_zephyr(next_zephyr);
}
