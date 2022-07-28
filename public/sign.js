function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}
function b64_to_utf8(str) {
    return decodeURIComponent(escape(window.atob(str)));
}

function sign(address, id) {
    full_name = utf8_to_b64($("#full_name").val());
    comment = utf8_to_b64($("#comment").val());
    location.href = `ton://transfer/${address}?amount=1&text=petition{"id":${id},"full_name":"${full_name}","comment":"${comment}"}`;
}
