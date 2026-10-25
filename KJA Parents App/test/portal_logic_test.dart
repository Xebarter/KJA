import 'package:flutter_test/flutter_test.dart';
import 'package:kja_parents/data/sample_portal.dart';
import 'package:kja_parents/format.dart';
import 'package:kja_parents/navigation.dart';

void main() {
  test('sample portal threads group unread inbound', () {
    final portal = samplePortal();
    expect(portal.children, hasLength(2));
    expect(portal.unreadMessages, greaterThan(0));
    expect(portal.threads, isNotEmpty);
    expect(portal.threads.first.subject, 'School fees');
  });

  test('dock destinations and money format', () {
    expect(AppDestination.children.isDock, isTrue);
    expect(AppDestination.home.isDock, isTrue);
    expect(AppDestination.communications.isDock, isTrue);
    expect(AppDestination.fees.isDock, isFalse);
    expect(moneyUgx(350000), contains('350,000'));
    expect(destinationForHref('/account/communications'), AppDestination.communications);
  });
}
